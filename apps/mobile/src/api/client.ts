import axios from 'axios';
import Constants from 'expo-constants';
import { QueryClient } from '@tanstack/react-query';
import { storage, STORAGE_KEYS } from '../utils/storage';

// Determine the base URL based on the environment
const getBaseUrl = () => {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }

  // For development (Expo Go / Emulator)
  // Use the IP address of the machine running the packager
  const debuggerHost = Constants.expoConfig?.hostUri;
  const localhost = debuggerHost?.split(':')[0] || 'localhost';

  // Default Next.js port is 3000
  return `http://${localhost}:3000`;
};

export const BASE_URL = getBaseUrl();

export const client = axios.create({
  baseURL: BASE_URL,
  withCredentials: true, // Important for cookies
  headers: {
    'Content-Type': 'application/json',
    'X-Client-Type': 'mobile', // Identify this as mobile app
  },
});

// Request Interceptor to inject token
client.interceptors.request.use(
  async (config) => {
    const token = await storage.getItem(STORAGE_KEYS.TOKEN);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 1000 * 30, // 30 seconds
    },
  },
});

// Add interceptor to handle 401s (Global Logout)
export const setupInterceptors = (onUnauthorized: () => Promise<void> | void) => {
  const interceptorId = client.interceptors.response.use(
    (response) => response,
    async (error) => {
      if (error.response?.status === 401) {
        // Only trigger if not on the login page or checking auth
        const isAuthCheck = error.config.url?.includes('/api/employee/auth/check');
        const isLogin = error.config.url?.includes('/api/employee/auth/login');
        
        if (!isAuthCheck && !isLogin) {
          await onUnauthorized();
        }
      }
      return Promise.reject(error);
    }
  );

  return () => {
    client.interceptors.response.eject(interceptorId);
  };
};
