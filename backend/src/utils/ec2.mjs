import {
    EC2Client,
    StopInstancesCommand,
    StartInstancesCommand,
    DescribeInstancesCommand,
} from '@aws-sdk/client-ec2';

const ec2Client = new EC2Client({});

export const stopInstance = async (instanceId) => {
    if (!instanceId) return;
    try {
        const command = new StopInstancesCommand({ InstanceIds: [instanceId] });
        await ec2Client.send(command);
        console.log(`Stopped instance ${instanceId}`);
    } catch (err) {
        console.error(`Failed to stop instance ${instanceId}`, err);
    }
};

export const startInstance = async (instanceId) => {
    if (!instanceId) return;
    try {
        const command = new StartInstancesCommand({ InstanceIds: [instanceId] });
        await ec2Client.send(command);
        console.log(`Started instance ${instanceId}`);
    } catch (err) {
        console.error(`Failed to start instance ${instanceId}`, err);
    }
};

export const getInstanceStatus = async (instanceId) => {
    if (!instanceId) return 'UNKNOWN';
    try {
        const command = new DescribeInstancesCommand({ InstanceIds: [instanceId] });
        const res = await ec2Client.send(command);
        return res.Reservations[0]?.Instances[0]?.State?.Name || 'UNKNOWN';
    } catch (err) {
        console.error(err);
        return 'UNKNOWN';
    }
};
