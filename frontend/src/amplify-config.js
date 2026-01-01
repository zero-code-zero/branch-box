// This file is automatically configured via environment variables
// Local development falls back to placeholders or .env.local values
const awsConfig = {
  Auth: {
    Cognito: {
      userPoolId: import.meta.env.VITE_USER_POOL_ID || 'ap-northeast-2_PLACEHOLDER',
      userPoolClientId: import.meta.env.VITE_USER_POOL_CLIENT_ID || 'PLACEHOLDER_CLIENT_ID',
    },
  },
  API: {
    REST: {
      BranchBoxAPI: {
        endpoint: import.meta.env.VITE_API_ENDPOINT || 'https://PLACEHOLDER.execute-api.ap-northeast-2.amazonaws.com',
        region: import.meta.env.VITE_AWS_REGION || 'ap-northeast-2',
      },
    },
  },
};

export default awsConfig;

