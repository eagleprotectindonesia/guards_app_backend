import axios from 'axios';
import Constants from 'expo-constants';
import { QueryClient } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { persistQueryClient } from '@tanstack/query-persist-client-core';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { storage, STORAGE_KEYS } from '../utils/storage';

let authTokenCache: string | null = null;

// Determine the base URL based on the environment
const getBaseUrl = () => {
  const configuredUrl = process.env.EXPO_PUBLIC_API_URL?.trim();

  if (configuredUrl) {
    if (!__DEV__ && !configuredUrl.startsWith('https://')) {
      throw new Error('EXPO_PUBLIC_API_URL must use HTTPS for non-development builds');
    }
    return configuredUrl;
  }

  if (!__DEV__) {
    // Fallback for production-like builds when the env var is unavailable.
    return 'https://crm.eagleprotect.id:3001';
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

export const setCachedAuthToken = (token: string | null) => {
  authTokenCache = token;
};

// Request Interceptor to inject token
client.interceptors.request.use(
  async config => {
    const token = authTokenCache ?? (await storage.getItem(STORAGE_KEYS.USER_TOKEN));
    if (token && !authTokenCache) {
      authTokenCache = token;
    }
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  error => Promise.reject(error)
);

// Response Interceptor to capture refreshed tokens
client.interceptors.response.use(
  async response => {
    const newToken = response.headers['x-new-token'];
    if (newToken) {
      console.log('[Axios Client] Captured refreshed token from x-new-token header');
      authTokenCache = newToken;
      await storage.setItem(STORAGE_KEYS.USER_TOKEN, newToken);
    }
    return response;
  },
  error => {
    return Promise.reject(error);
  }
);

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 1000 * 30, // 30 seconds
    },
  },
});

const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'REACT_QUERY_OFFLINE_CACHE',
});

export function persistCalendarQueries() {
  persistQueryClient({
    queryClient,
    persister: asyncStoragePersister,
    maxAge: 1000 * 60 * 60 * 24, // 24 hours
    dehydrateOptions: {
      shouldDehydrateQuery: (query: { queryKey: readonly unknown[] }): boolean => {
        const key = (query.queryKey as unknown[])[0];
        return key === 'calendar';
      },
    },
  } as any);
}

// Add interceptor to handle 401s (Global Logout)
export const setupInterceptors = (onUnauthorized: () => Promise<void> | void) => {
  const interceptorId = client.interceptors.response.use(
    response => response,
    async error => {
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
