import axios from 'axios';
import { fetchAuthSession } from 'aws-amplify/auth';
import awsConfig from './amplify-config';

const api = axios.create({
    baseURL: awsConfig.API.REST.BranchBoxAPI.endpoint,
});

api.interceptors.request.use(async (config) => {
    try {
        const session = await fetchAuthSession();
        const token = session.tokens?.idToken?.toString();
        if (token) {
            config.headers.Authorization = token;
        }
    } catch (error) {
        console.error('Error fetching auth session', error);
    }
    return config;
});

export const listRepos = () => api.get('/repos');
export const listEnvs = () => api.get('/envs');
export const createEnv = (services) => api.post('/envs', { repo: services[0].repo, branch: services[0].branch }); // Legacy support if needed, or update backend to handle list. 
// Note: Backend currently handles {repo, branch} single object in POST /envs. 
// We should update Backend to handle multiple services if that was the plan. 
// BUT for now, let's stick to the GitHub Config task.
export const getConfig = () => api.get('/config');
export const saveConfig = (config) => api.post('/config', config);
export const deployEnv = (stackName, services) => api.post('/deploy', { stackName, services });
export const deleteEnv = (stackId) => api.delete(`/envs?stackId=${stackId}`);

export default api;
