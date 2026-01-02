import {
    CloudFormationClient,
    CreateStackCommand,
    DeleteStackCommand,
    UpdateStackCommand,
    DescribeStacksCommand,
} from '@aws-sdk/client-cloudformation';

const cfClient = new CloudFormationClient({});

// Helper to sanitize resource names (Alphanumeric only)
const cleanName = (str) => str.replace(/[^a-zA-Z0-9]/g, '');

const generateTemplate = (stackName, services) => {
    // services: [{ repo: 'user/repo', branch: 'main', buildspec: 'path', appspec: 'path' }]

    const template = {
        AWSTemplateFormatVersion: '2010-09-09',
        Description: `BranchBox Environment: ${stackName}`,
        Parameters: {
            LatestAmiId: {
                Type: 'AWS::SSM::Parameter::Value<AWS::EC2::Image::Id>',
                Default: '/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64',
            },
        },
        Resources: {
            // --- Shared Resources ---

            // 1. Artifact Bucket (Stores Source Zips and Build Artifacts)
            ArtifactBucket: {
                Type: 'AWS::S3::Bucket',
                Properties: {
                    BucketEncryption: {
                        ServerSideEncryptionConfiguration: [
                            { ServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } },
                        ],
                    },
                    VersioningConfiguration: { Status: 'Enabled' }, // Required for Pipeline
                },
            },

            // 2. IAM Roles
            // EC2 Role (for CodeDeploy Agent)
            EC2Role: {
                Type: 'AWS::IAM::Role',
                Properties: {
                    AssumeRolePolicyDocument: {
                        Version: '2012-10-17',
                        Statement: [
                            {
                                Effect: 'Allow',
                                Principal: { Service: 'ec2.amazonaws.com' },
                                Action: 'sts:AssumeRole',
                            },
                        ],
                    },
                    ManagedPolicyArns: [
                        'arn:aws:iam::aws:policy/service-role/AmazonEC2RoleforAWSCodeDeploy',
                        'arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore', // For Session Manager access
                    ],
                    Policies: [
                        {
                            PolicyName: 'S3Access',
                            PolicyDocument: {
                                Version: '2012-10-17',
                                Statement: [
                                    {
                                        Effect: 'Allow',
                                        Action: ['s3:Get*', 's3:List*'],
                                        Resource: '*',
                                    },
                                ],
                            },
                        },
                    ],
                },
            },
            EC2InstanceProfile: {
                Type: 'AWS::IAM::InstanceProfile',
                Properties: { Roles: [{ Ref: 'EC2Role' }] },
            },

            // CodePipeline Role
            PipelineRole: {
                Type: 'AWS::IAM::Role',
                Properties: {
                    AssumeRolePolicyDocument: {
                        Version: '2012-10-17',
                        Statement: [
                            {
                                Effect: 'Allow',
                                Principal: { Service: 'codepipeline.amazonaws.com' },
                                Action: 'sts:AssumeRole',
                            },
                        ],
                    },
                    Policies: [
                        {
                            PolicyName: 'PipelinePolicy',
                            PolicyDocument: {
                                Version: '2012-10-17',
                                Statement: [
                                    { Effect: 'Allow', Action: 's3:*', Resource: '*' },
                                    { Effect: 'Allow', Action: 'codebuild:*', Resource: '*' },
                                    { Effect: 'Allow', Action: 'codedeploy:*', Resource: '*' },
                                    { Effect: 'Allow', Action: 'iam:PassRole', Resource: '*' },
                                ],
                            },
                        },
                    ],
                },
            },

            // CodeBuild Role
            CodeBuildRole: {
                Type: 'AWS::IAM::Role',
                Properties: {
                    AssumeRolePolicyDocument: {
                        Version: '2012-10-17',
                        Statement: [
                            {
                                Effect: 'Allow',
                                Principal: { Service: 'codebuild.amazonaws.com' },
                                Action: 'sts:AssumeRole',
                            },
                        ],
                    },
                    Policies: [
                        {
                            PolicyName: 'BuildPolicy',
                            PolicyDocument: {
                                Version: '2012-10-17',
                                Statement: [
                                    { Effect: 'Allow', Action: 'logs:*', Resource: '*' },
                                    { Effect: 'Allow', Action: 's3:*', Resource: '*' },
                                ],
                            },
                        },
                    ],
                },
            },

            // CodeDeploy Service Role
            CodeDeployRole: {
                Type: 'AWS::IAM::Role',
                Properties: {
                    AssumeRolePolicyDocument: {
                        Version: '2012-10-17',
                        Statement: [
                            {
                                Effect: 'Allow',
                                Principal: { Service: 'codedeploy.amazonaws.com' },
                                Action: 'sts:AssumeRole',
                            },
                        ],
                    },
                    ManagedPolicyArns: ['arn:aws:iam::aws:policy/service-role/AWSCodeDeployRole'],
                },
            },

            // 3. EC2 Instance
            DevInstance: {
                Type: 'AWS::EC2::Instance',
                Properties: {
                    ImageId: { Ref: 'LatestAmiId' },
                    InstanceType: 't3.medium', // Bump to medium for multi-service
                    IamInstanceProfile: { Ref: 'EC2InstanceProfile' },
                    SecurityGroups: ['default'], // Setup proper SG in prod
                    Tags: [
                        { Key: 'Name', Value: `BranchBox-${stackName}` },
                        { Key: 'EnvType', Value: 'BranchBox' }, // For CodeDeploy Tag Filter
                    ],
                    UserData: {
                        'Fn::Base64': Buffer.from(
                            `#!/bin/bash
dnf update -y
dnf install -y ruby wget
# Install CodeDeploy Agent
cd /home/ec2-user
wget https://aws-codedeploy-\${AWS::Region}.s3.\${AWS::Region}.amazonaws.com/latest/install
chmod +x ./install
./install auto

# Install Docker
dnf install -y docker
service docker start
systemctl enable docker
usermod -aG docker ec2-user
# Install Docker Compose
dnf install -y docker-compose-plugin
`,
                        ).toString('base64'),
                    },
                },
            },

            // 4. CodeDeploy Application (Shared)
            SharedApplication: {
                Type: 'AWS::CodeDeploy::Application',
                Properties: { ComputePlatform: 'Server' },
            },

            // Deployment Group (Targets the EC2)
            SharedDeploymentGroup: {
                Type: 'AWS::CodeDeploy::DeploymentGroup',
                Properties: {
                    ApplicationName: { Ref: 'SharedApplication' },
                    ServiceRoleArn: { 'Fn::GetAtt': ['CodeDeployRole', 'Arn'] },
                    DeploymentConfigName: 'CodeDeployDefault.OneAtATime',
                    Ec2TagFilters: [
                        { Key: 'Name', Value: `BranchBox-${stackName}`, Type: 'KEY_AND_VALUE' },
                    ],
                },
            },
        },
        Outputs: {
            PublicIP: { Value: { 'Fn::GetAtt': ['DevInstance', 'PublicIp'] } },
            PublicDNS: { Value: { 'Fn::GetAtt': ['DevInstance', 'PublicDnsName'] } },
            InstanceId: { Value: { Ref: 'DevInstance' } },
            ArtifactBucketName: { Value: { Ref: 'ArtifactBucket' } },
        },
    };

    // --- Dynamic Resources (Per Service) ---
    services.forEach((svc, index) => {
        const safeRepo = cleanName(svc.repo);
        const safeBranch = cleanName(svc.branch);
        const uniqueId = `${safeRepo}${safeBranch}${index}`; // Append index for uniqueness

        // 5. CodeBuild Project
        template.Resources[`BuildProject${uniqueId}`] = {
            Type: 'AWS::CodeBuild::Project',
            Properties: {
                Name: `BB-${stackName}-${uniqueId}`,
                ServiceRole: { 'Fn::GetAtt': ['CodeBuildRole', 'Arn'] },
                Artifacts: { Type: 'CODEPIPELINE' },
                Environment: {
                    ComputeType: 'BUILD_GENERAL1_SMALL',
                    Image: 'aws/codebuild/amazonlinux2-x86_64-standard:4.0',
                    Type: 'LINUX_CONTAINER',
                    EnvironmentVariables: [
                        { Name: 'BUILDSPEC_PATH', Value: svc.buildspec || 'buildspec.yml' },
                        { Name: 'APPSPEC_PATH', Value: svc.appspec || 'appspec.yml' },
                    ],
                },
                Source: {
                    Type: 'CODEPIPELINE',
                    BuildSpec: `
version: 0.2
phases:
  install:
    commands:
      - echo Installing dependencies...
  build:
    commands:
      - echo Build started on \`date\`
      - echo "Handling custom specs..."
      - if [ "$BUILDSPEC_PATH" != "buildspec.yml" ] && [ -f "$BUILDSPEC_PATH" ]; then cp "$BUILDSPEC_PATH" buildspec.yml; fi
      - if [ "$APPSPEC_PATH" != "appspec.yml" ] && [ -f "$APPSPEC_PATH" ]; then cp "$APPSPEC_PATH" appspec.yml; fi
artifacts:
  files:
    - '**/*'
`,
                },
            },
        };

        // 6. CodePipeline
        template.Resources[`Pipeline${uniqueId}`] = {
            Type: 'AWS::CodePipeline::Pipeline',
            Properties: {
                RoleArn: { 'Fn::GetAtt': ['PipelineRole', 'Arn'] },
                ArtifactStore: {
                    Type: 'S3',
                    Location: { Ref: 'ArtifactBucket' },
                },
                Stages: [
                    {
                        Name: 'Source',
                        Actions: [
                            {
                                Name: 'S3Source',
                                ActionTypeId: {
                                    Category: 'Source',
                                    Owner: 'AWS',
                                    Provider: 'S3',
                                    Version: '1',
                                },
                                OutputArtifacts: [{ Name: 'SourceArtifact' }],
                                Configuration: {
                                    S3Bucket: { Ref: 'ArtifactBucket' },
                                    S3ObjectKey: `sources/${uniqueId}.zip`, // Key where we upload
                                    PollForSourceChanges: 'true',
                                },
                                RunOrder: 1,
                            },
                        ],
                    },
                    {
                        Name: 'Build',
                        Actions: [
                            {
                                Name: 'CodeBuild',
                                ActionTypeId: {
                                    Category: 'Build',
                                    Owner: 'AWS',
                                    Provider: 'CodeBuild',
                                    Version: '1',
                                },
                                InputArtifacts: [{ Name: 'SourceArtifact' }],
                                OutputArtifacts: [{ Name: 'BuildArtifact' }],
                                Configuration: {
                                    ProjectName: { Ref: `BuildProject${uniqueId}` },
                                },
                                RunOrder: 1,
                            },
                        ],
                    },
                    {
                        Name: 'Deploy',
                        Actions: [
                            {
                                Name: 'CodeDeploy',
                                ActionTypeId: {
                                    Category: 'Deploy',
                                    Owner: 'AWS',
                                    Provider: 'CodeDeploy',
                                    Version: '1',
                                },
                                InputArtifacts: [{ Name: 'BuildArtifact' }],
                                Configuration: {
                                    ApplicationName: { Ref: 'SharedApplication' },
                                    DeploymentGroupName: { Ref: 'SharedDeploymentGroup' },
                                },
                                RunOrder: 1,
                            },
                        ],
                    },
                ],
            },
        };
    });

    return JSON.stringify(template);
};

export const createEnvironmentStack = async (services, roleArn) => {
    // services: [{ repo, branch, ... }]
    const timestamp = Date.now().toString().slice(-6);
    const stackName = `BB-Env-${timestamp}`;
    const templateBody = generateTemplate(stackName, services);

    const params = {
        StackName: stackName,
        TemplateBody: templateBody,
        Capabilities: ['CAPABILITY_IAM', 'CAPABILITY_NAMED_IAM'],
        Tags: [{ Key: 'BranchBoxManaged', Value: 'true' }],
    };

    // If Service Role is provided (Production Mode), use it.
    if (roleArn) {
        params.RoleARN = roleArn;
    }

    const command = new CreateStackCommand(params);

    try {
        const response = await cfClient.send(command);
        return { stackId: response.StackId, stackName, services };
    } catch (error) {
        console.error('Error creating stack:', error);
        throw error;
    }
};

export const deleteEnvironmentStack = async (stackNameOrId) => {
    const command = new DeleteStackCommand({ StackName: stackNameOrId });
    try {
        await cfClient.send(command);
        return true;
    } catch (error) {
        console.error('Error deleting stack:', error);
        throw error;
    }
};

export const getStackOutputs = async (stackName) => {
    try {
        const command = new DescribeStacksCommand({ StackName: stackName });
        const { Stacks } = await cfClient.send(command);
        if (!Stacks || Stacks.length === 0) return null;

        const stack = Stacks[0];
        // Only return outputs if stack is CREATE_COMPLETE or UPDATE_COMPLETE
        if (stack.StackStatus !== 'CREATE_COMPLETE' && stack.StackStatus !== 'UPDATE_COMPLETE') {
            return null;
        }

        const outputs = {};
        stack.Outputs?.forEach((o) => {
            outputs[o.OutputKey] = o.OutputValue;
        });
        return outputs;
    } catch (error) {
        console.error('Error getting stack outputs:', error);
        return null;
    }
};
