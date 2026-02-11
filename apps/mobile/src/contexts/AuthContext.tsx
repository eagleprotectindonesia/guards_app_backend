import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Alert } from 'react-native';
import { storage, STORAGE_KEYS } from '../utils/storage';
import { client, setupInterceptors } from '../api/client';
import { getSocket, disconnectSocket } from '../api/socket';
import { Employee } from '@repo/types';

type AuthState =
  | { isLoading: true; isAuthenticated: false; user: null; token: null }
  | { isLoading: false; isAuthenticated: true; user: Employee; token: string }
  | { isLoading: false; isAuthenticated: false; user: null; token: null };

type AuthContextType = AuthState & {
  login: (token: string, user: Employee) => Promise<void>;
  logout: (reason?: string) => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: null,
    isLoading: true,
    isAuthenticated: false,
  });

  const logout = useCallback(async (reason?: string) => {
    // reason could be used for showing specific alerts in the future 
    // but for now we just handle the cleanup
    disconnectSocket();
    await storage.clear();
    setState({
      user: null,
      token: null,
      isLoading: false,
      isAuthenticated: false,
    });
  }, []);

  const login = useCallback(async (token: string, user: Employee) => {
    await storage.setItem(STORAGE_KEYS.TOKEN, token);
    await storage.setItem(STORAGE_KEYS.EMPLOYEE_INFO, user);
    
    setState({
      user,
      token,
      isLoading: false,
      isAuthenticated: true,
    });
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const res = await client.get('/api/employee/my/profile');
      const user = res.data.employee;
      await storage.setItem(STORAGE_KEYS.EMPLOYEE_INFO, user);
      setState(prev => {
        if (prev.isAuthenticated) {
          return { ...prev, user };
        }
        return prev;
      });
    } catch (error) {
      console.error('Failed to refresh user profile:', error);
    }
  }, []);

  useEffect(() => {
    const hydrate = async () => {
      try {
        const [token, user] = await Promise.all([
          storage.getItem(STORAGE_KEYS.TOKEN),
          storage.getItem(STORAGE_KEYS.EMPLOYEE_INFO),
        ]);

        if (token && user) {
          // Validate token with backend
          try {
            await client.get('/api/employee/auth/check');
            setState({
              user,
              token,
              isLoading: false,
              isAuthenticated: true,
            });
          } catch (error: any) {
            // If it's a 401, clear everything
            if (error.response?.status === 401) {
              await logout();
            } else {
              // Other errors (network, etc) - maybe keep old state but set loading false
              setState({
                user,
                token,
                isLoading: false,
                isAuthenticated: true,
              });
            }
          }
        } else {
          setState({
            isLoading: false,
            isAuthenticated: false,
            user: null,
            token: null,
          });
        }
      } catch (error) {
        console.error('Auth hydration error:', error);
        setState({
          isLoading: false,
          isAuthenticated: false,
          user: null,
          token: null,
        });
      }
    };

    hydrate();
  }, [logout]);

  // Handle socket lifecycle
  useEffect(() => {
    if (state.isAuthenticated && state.token) {
      getSocket();
    } else {
      disconnectSocket();
    }
  }, [state.isAuthenticated, state.token]);

  // Setup 401 interceptor only when authenticated
  useEffect(() => {
    if (!state.isAuthenticated) {
      return;
    }

    let isHandling401 = false;

    const cleanup = setupInterceptors(async () => {
      if (isHandling401) return;
      isHandling401 = true;

      // Disconnect socket immediately to prevent errors
      disconnectSocket();

      Alert.alert(
        'Session Expired',
        'Your session has expired. Please login again.',
        [
          {
            text: 'OK',
            onPress: async () => {
              await logout('session_expired');
              isHandling401 = false;
            },
          },
        ]
      );
    });

    return () => {
      cleanup();
    };
  }, [state.isAuthenticated, logout]);

  return (
    <AuthContext.Provider value={{ ...state, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
