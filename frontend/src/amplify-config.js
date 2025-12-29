// This file will be automatically updated or manually configured after deployment
// For now, these are placeholders.
const awsConfig = {
    Auth: {
        Cognito: {
            userPoolId: 'ap-northeast-2_PLACEHOLDER', // Replace with Output from SAM Deploy
            userPoolClientId: 'PLACEHOLDER_CLIENT_ID', // Replace with Output from SAM Deploy
        }
    },
    API: {
        REST: {
            BranchBoxAPI: {
                endpoint: 'https://PLACEHOLDER.execute-api.ap-northeast-2.amazonaws.com', // Replace with Output
                region: 'ap-northeast-2'
            }
        }
    }
};

export default awsConfig;
