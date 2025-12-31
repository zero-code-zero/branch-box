import { App } from '@octokit/app';
import { request } from '@octokit/request';

// These keys would typically come from Secrets Manager or SSM Parameter Store
// For MVP/Demo, we assume they are available as environment variables
const APP_ID = process.env.GITHUB_APP_ID;
const PRIVATE_KEY = process.env.GITHUB_PRIVATE_KEY; // Should be base64 encoded or properly formatted string

const app = new App({
    appId: APP_ID,
    privateKey: PRIVATE_KEY,
});

export const getInstallationAccessToken = async (appId, privateKey, installationId) => {
    let githubApp = app;
    if (appId && privateKey) {
        githubApp = new App({ appId, privateKey });
    }

    // If only installationId is passed (legacy/env var mode), handle it
    const id = installationId || appId;
    // Check if appId is actually installationId (if called with 1 arg)
    // To be safe, let's assume strict usage from app.mjs: (appId, pk, installId)
    // If called as (installId), then appId is installId, privateKey is undefined.
    // Logic:
    const targetInstallationId = installationId || (typeof appId === 'string' ? appId : undefined);

    if (!targetInstallationId) throw new Error('Missing Installation ID');

    const {
        data: { token },
    } = await githubApp.octokit.request('POST /app/installations/{installation_id}/access_tokens', {
        installation_id: targetInstallationId,
    });
    return token;
};

export const listRepositories = async (accessToken) => {
    const { data } = await request('GET /installation/repositories', {
        headers: {
            authorization: `token ${accessToken}`,
        },
    });
    return data.repositories.map((repo) => ({
        id: repo.id,
        name: repo.name,
        full_name: repo.full_name,
        owner: repo.owner.login,
        url: repo.html_url,
    }));
};

export const listBranches = async (accessToken, owner, repo) => {
    const { data } = await request('GET /repos/{owner}/{repo}/branches', {
        owner,
        repo,
        headers: {
            authorization: `token ${accessToken}`,
        },
    });
    return data.map((branch) => ({
        name: branch.name,
        sha: branch.commit.sha,
    }));
};

export const downloadRepoArchive = async (accessToken, owner, repo, branch) => {
    console.log(`Downloading archive for ${owner}/${repo}@${branch}`);
    const response = await request('GET /repos/{owner}/{repo}/zipball/{ref}', {
        owner,
        repo,
        ref: branch,
        headers: {
            authorization: `token ${accessToken}`,
        },
        request: {
            parseSuccessResponseBody: false, // Return raw buffer/stream
        },
    });
    return response.data;
};
