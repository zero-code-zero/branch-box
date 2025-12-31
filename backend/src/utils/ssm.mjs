import { SSMClient, PutParameterCommand, GetParametersCommand } from '@aws-sdk/client-ssm';

const ssmClient = new SSMClient();

const PARAM_PREFIX = '/branchbox/config/github';

export const saveGithubConfig = async (appId, installationId, privateKey, clientSecret) => {
    await Promise.all([
        ssmClient.send(
            new PutParameterCommand({
                Name: `${PARAM_PREFIX}/appId`,
                Value: appId,
                Type: 'String',
                Overwrite: true,
            }),
        ),
        ssmClient.send(
            new PutParameterCommand({
                Name: `${PARAM_PREFIX}/installationId`,
                Value: installationId,
                Type: 'String',
                Overwrite: true,
            }),
        ),
        ssmClient.send(
            new PutParameterCommand({
                Name: `${PARAM_PREFIX}/privateKey`,
                Value: privateKey,
                Type: 'SecureString',
                Overwrite: true,
            }),
        ),
        ssmClient.send(
            new PutParameterCommand({
                Name: `${PARAM_PREFIX}/clientSecret`,
                Value: clientSecret,
                Type: 'SecureString',
                Overwrite: true,
            }),
        ),
    ]);
};

export const getGithubConfig = async () => {
    const names = ['appId', 'installationId', 'privateKey', 'clientSecret'].map(
        (n) => `${PARAM_PREFIX}/${n}`,
    );
    const command = new GetParametersCommand({
        Names: names,
        WithDecryption: true,
    });

    const response = await ssmClient.send(command);
    const config = {};

    response.Parameters.forEach((param) => {
        const name = param.Name.split('/').pop();
        config[name] = param.Value;
    });

    return config;
};
