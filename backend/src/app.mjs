import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, PutCommand, DeleteCommand, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { listRepositories, getInstallationAccessToken, listBranches, downloadRepoArchive } from "./utils/github.mjs";
import { createEnvironmentStack, deleteEnvironmentStack, getStackOutputs } from "./utils/cloudformation.mjs";
import { stopInstance } from "./utils/ec2.mjs";
import { saveGithubConfig, getGithubConfig } from "./utils/ssm.mjs";
import { uploadSourceZip } from "./utils/s3.mjs";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME;

const response = (statusCode, body) => ({
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
});

// Helper: Deploy Source to S3 (Triggers Pipeline)
const deployServiceSource = async (stackName, services, accessToken) => {
    // 1. Get Bucket Name
    const outputs = await getStackOutputs(stackName);
    const bucketName = outputs.ArtifactBucketName;
    if (!bucketName) throw new Error("ArtifactBucketName not found");

    const results = [];
    // 2. Process each service
    for (let i = 0; i < services.length; i++) {
        const svc = services[i];
        const uniqueId = `${svc.repo.replace(/[^a-zA-Z0-9]/g, '')}${svc.branch.replace(/[^a-zA-Z0-9]/g, '')}${i}`;

        const [owner, repo] = svc.repo.split('/');

        console.log(`Downloading ${owner}/${repo}@${svc.branch}...`);
        const archive = await downloadRepoArchive(accessToken, owner, repo, svc.branch);

        console.log(`Uploading to s3://${bucketName}/sources/${uniqueId}.zip...`);
        await uploadSourceZip(bucketName, `sources/${uniqueId}.zip`, archive);
        results.push(uniqueId);
    }
    return results;
};

export const managerHandler = async (event) => {
    console.log('Manager invoked:', event.routeKey);

    try {
        // --- Config Management ---
        if (event.routeKey === "POST /config") {
            const { appId, installationId, privateKey, clientSecret } = JSON.parse(event.body);
            await saveGithubConfig(appId, installationId, privateKey, clientSecret);
            return response(200, { message: 'Configuration saved' });
        }

        if (event.routeKey === "GET /config") {
            try {
                const config = await getGithubConfig();
                const exists = !!(config.appId && config.privateKey);
                return response(200, {
                    configured: exists,
                    appId: config.appId || null,
                    installationId: config.installationId || null
                });
            } catch (e) {
                return response(200, { configured: false });
            }
        }

        // --- Auth & GitHub Connection ---
        const config = await getGithubConfig();
        const installationId = config.installationId || process.env.GITHUB_INSTALLATION_ID;
        const appId = config.appId || process.env.GITHUB_APP_ID;
        const privateKey = config.privateKey || process.env.GITHUB_PRIVATE_KEY;

        let accessToken;
        if (installationId && appId && privateKey) {
            try {
                accessToken = await getInstallationAccessToken(appId, privateKey, installationId);
            } catch (e) {
                console.warn("Failed to get GitHub access token:", e.message);
            }
        }

        // GET /repos
        if (event.routeKey === "GET /repos") {
            if (!accessToken) return response(401, { error: "GitHub App not configured" });
            const repos = await listRepositories(accessToken);
            return response(200, repos);
        }

        // GET /envs
        if (event.routeKey === "GET /envs") {
            const command = new ScanCommand({ TableName: TABLE_NAME });
            const result = await docClient.send(command);
            return response(200, result.Items);
        }

        // POST /envs (Create Stack)
        if (event.routeKey === "POST /envs") {
            const body = JSON.parse(event.body);
            let services = body.services;
            const alias = body.name || '';
            // Default to '18:00' only if undefined. Allow "" (Disabled).
            const stopTime = body.stopTime !== undefined ? body.stopTime : '18:00';
            const startTime = body.startTime !== undefined ? body.startTime : ''; // Default Disabled

            // Legacy support
            if (!services && body.repo && body.branch) {
                services = [{ repo: body.repo, branch: body.branch }];
            }

            if (!accessToken) return response(401, { error: "GitHub App not configured" });
            if (!services || services.length === 0) return response(400, { error: "Missing services" });

            // 1. Trigger CloudFormation
            // Pass alias to help name the stack? Or just keep it generic.
            // Let's keep stack name generic (safe) but store Alias in DB.
            const { stackId, stackName } = await createEnvironmentStack(services);

            // 2. Save to DynamoDB
            const mainService = services[0];
            const item = {
                RepoName: mainService.repo, // Primary Key (Hash)
                BranchName: mainService.branch, // Primary Key (Range)
                StackId: stackId,
                StackName: stackName,
                Alias: alias,
                StopTime: stopTime,
                StartTime: startTime,
                Status: "CREATING",
                CreatedAt: new Date().toISOString(),
                Services: services,
                Owner: "user"
            };

            await docClient.send(new PutCommand({
                TableName: TABLE_NAME,
                Item: item
            }));

            return response(201, item);
        }

        // POST /deploy (Manual Trigger)
        if (event.routeKey === "POST /deploy") {
            const body = JSON.parse(event.body);
            const { stackName, services } = body; // Expects full service list or fetches from DB?
            // If UI passes services, great. If not, we might need to fetch. 
            // UI should pass it for simplicity now as it has state.

            if (!accessToken) return response(401, { error: "GitHub App not configured" });

            await deployServiceSource(stackName, services, accessToken);

            return response(200, { message: "Deployment triggered" });
        }

        // DELETE /envs
        if (event.routeKey === "DELETE /envs") {
            const stackId = event.queryStringParameters?.stackId;
            let dbKey = null;

            // Simple DB Lookup Logic
            if (stackId) {
                const scanCmd = new ScanCommand({
                    TableName: TABLE_NAME,
                    FilterExpression: "StackId = :sid",
                    ExpressionAttributeValues: { ":sid": stackId }
                });
                const { Items } = await docClient.send(scanCmd);
                if (Items && Items.length > 0) {
                    dbKey = { RepoName: Items[0].RepoName, BranchName: Items[0].BranchName };
                }
            } else {
                const { repo, branch } = event.queryStringParameters;
                if (repo && branch) dbKey = { RepoName: repo, BranchName: branch };
            }

            if (!dbKey) return response(404, { error: "Environment not found" });

            // Delete Stack
            const getCmd = new GetCommand({ TableName: TABLE_NAME, Key: dbKey });
            const { Item } = await docClient.send(getCmd);

            if (Item) {
                await deleteEnvironmentStack(Item.StackId);
                await docClient.send(new DeleteCommand({ TableName: TABLE_NAME, Key: dbKey }));
            }

            return response(200, { message: "Environment deleting" });
        }

        return response(404, { error: "Route not found" });

    } catch (error) {
        console.error(error);
        return response(500, { error: error.message });
    }
};

export const webhookHandler = async (event) => {
    console.log('Webhook invoked');

    try {
        const githubEvent = event.headers['x-github-event'];
        const body = JSON.parse(event.body);

        // --- GitHub App Auth ---
        // We need auth to download the zip even in webhook (private repos)
        const config = await getGithubConfig();
        const installationId = config.installationId || process.env.GITHUB_INSTALLATION_ID;
        const appId = config.appId || process.env.GITHUB_APP_ID;
        const privateKey = config.privateKey || process.env.GITHUB_PRIVATE_KEY;

        let accessToken;
        if (installationId && appId && privateKey) {
            try {
                // If webhook event has installation id, use it preferably?
                // But for now use stored config.
                accessToken = await getInstallationAccessToken(appId, privateKey, installationId);
            } catch (e) { console.error(e); }
        }

        if (githubEvent === 'push') {
            const repoName = body.repository.full_name;
            const branchName = body.ref.replace('refs/heads/', '');
            console.log(`Push detected: ${repoName}/${branchName}`);

            // 1. Find Environment containing this repo/branch
            // Scan DB (Inefficient but fine for MVP)
            // We need to look inside 'Services' array of each item
            const scanCmd = new ScanCommand({ TableName: TABLE_NAME });
            const { Items } = await docClient.send(scanCmd);

            const targetEnv = Items.find(item =>
                item.Services && item.Services.some(s => s.repo === repoName && s.branch === branchName)
            );

            if (targetEnv) {
                console.log(`Found environment: ${targetEnv.StackName}. Triggering deploy.`);
                if (accessToken) {
                    await deployServiceSource(targetEnv.StackName, targetEnv.Services, accessToken);
                    console.log("Deploy triggered successfully.");
                } else {
                    console.error("No access token available for deploy.");
                }
            } else {
                console.log("No environment configuration found for this repo/branch.");
            }
        }

        // ... (Keep existing PR/Delete logic if needed, but omitted for brevity/focus on Push)

        return response(200, { message: 'Webhook processed' });

    } catch (error) {
        console.error(error);
        return response(500, { error: error.message });
    }
};

export const schedulerHandler = async (event) => {
    const now = new Date();
    // UTC to KST (approx)
    const kstHour = (now.getUTCHours() + 9) % 24;
    console.log(`Scheduler running. Current KST Hour: ${kstHour}`);

    try {
        const scanCmd = new ScanCommand({
            TableName: TABLE_NAME,
            FilterExpression: "#s = :r",
            ExpressionAttributeNames: { "#s": "Status" },
            ExpressionAttributeValues: { ":r": "RUNNING" }
        });
        const { Items } = await docClient.send(scanCmd);

        for (const item of Items) {
            // If StopTime is not set or empty, do not run auto-stop.
            if (!item.StopTime) continue;

            const targetTimeStr = item.StopTime;
            const targetHour = parseInt(targetTimeStr.split(':')[0], 10);

            if (targetHour === kstHour) {
                console.log(`Stopping ${item.StackName} (Scheduled: ${targetTimeStr} KST)`);
                // Mark as STOPPED in DB (Simulating stop for now)
                await docClient.send(new UpdateCommand({
                    TableName: TABLE_NAME,
                    Key: { RepoName: item.RepoName, BranchName: item.BranchName },
                    UpdateExpression: "set #s = :s",
                    ExpressionAttributeNames: { "#s": "Status" },
                    ExpressionAttributeValues: { ":s": "STOPPED" }
                }));
            }
        }

        // --- Auto Start Logic ---
        const scanStoppedCmd = new ScanCommand({
            TableName: TABLE_NAME,
            FilterExpression: "#s = :r",
            ExpressionAttributeNames: { "#s": "Status" },
            ExpressionAttributeValues: { ":r": "STOPPED" }
        });
        const { Items: stoppedItems } = await docClient.send(scanStoppedCmd);

        for (const item of stoppedItems) {
            if (!item.StartTime) continue;

            const targetTimeStr = item.StartTime;
            const targetHour = parseInt(targetTimeStr.split(':')[0], 10);

            if (targetHour === kstHour) {
                console.log(`Starting ${item.StackName} (Scheduled: ${targetTimeStr} KST)`);
                // Mark as RUNNING in DB (Simulating start)
                await docClient.send(new UpdateCommand({
                    TableName: TABLE_NAME,
                    Key: { RepoName: item.RepoName, BranchName: item.BranchName },
                    UpdateExpression: "set #s = :s",
                    ExpressionAttributeNames: { "#s": "Status" },
                    ExpressionAttributeValues: { ":s": "RUNNING" }
                }));
            }
        }
    } catch (e) {
        console.error("Scheduler failed:", e);
    }
    return response(200, { message: 'Scheduler finished' });
};
