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
// { services: [], name: 'alias', stopTime: '18:00' }
export const createEnv = (services, name = '', stopTime = '18:00') => api.post('/envs', { services, name, stopTime });
export const getConfig = () => api.get('/config');
export const saveConfig = (config) => api.post('/config', config);
export const deployEnv = (stackName, services) => api.post('/deploy', { stackName, services });
export const deleteEnv = (stackId, type = 'archive') => api.delete(`/envs?stackId=${stackId}&type=${type}`);

export default api;
