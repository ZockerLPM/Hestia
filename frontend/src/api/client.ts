import axios, { AxiosResponse } from 'axios';
import toast from 'react-hot-toast';

export const api = axios.create({
  baseURL: '/api',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('hestia-token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

const MUTATION_METHODS = new Set(['post', 'put', 'delete', 'patch']);

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const status = err.response?.status;
    if (status === 401) {
      localStorage.removeItem('hestia-token');
      if (window.location.pathname !== '/login') window.location.href = '/login';
      return Promise.reject(err);
    }

    const method = (err.config?.method || '').toLowerCase();
    const isNetworkError = err.code === 'ERR_NETWORK' || !err.response;
    const isMutation = MUTATION_METHODS.has(method);

    if (isNetworkError && isMutation && !err.config?.silent && !err.config?.skipQueue) {
      const { enqueue } = await import('./offlineQueue');
      await enqueue({
        method: method as 'post' | 'put' | 'delete' | 'patch',
        url: err.config.url,
        data: err.config.data ? JSON.parse(err.config.data) : undefined,
      });
      toast.success('Offline — wird gesendet sobald online', { icon: '📡' });
      return Promise.resolve({ data: null, status: 202, statusText: 'Queued', headers: {}, config: err.config } as AxiosResponse);
    }

    if (err.config?.silent) return Promise.reject(err);

    const message = err.response?.data?.error
      || err.response?.data?.message
      || (isNetworkError ? 'Server nicht erreichbar' : 'Ein Fehler ist aufgetreten');
    toast.error(message);
    return Promise.reject(err);
  },
);

declare module 'axios' {
  export interface AxiosRequestConfig {
    silent?: boolean;
    skipQueue?: boolean;
  }
}
