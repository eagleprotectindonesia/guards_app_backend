import axios from 'axios';
import Constants from 'expo-constants';
import { QueryClient } from '@tanstack/react-query';

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
  },
});

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 1000 * 30, // 30 seconds
    },
  },
});

// Add interceptor to handle 401s (Global Logout)
// We will assign the navigation logic in the Root Component or via a navigation reference
export const setupInterceptors = (onUnauthorized: () => Promise<void> | void) => {
  const interceptorId = client.interceptors.response.use(
    response => response,
    async error => {
      if (error.response?.status === 401) {
        await onUnauthorized();
      }
      return Promise.reject(error);
    }
  );

  return () => client.interceptors.response.eject(interceptorId);
};
