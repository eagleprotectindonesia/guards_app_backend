import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Alert } from 'react-native';
import { storage, STORAGE_KEYS } from '../utils/storage';
import { client, setupInterceptors } from '../api/client';
import { getSocket, disconnectSocket } from '../api/socket';
import { stopGeofencing } from '../utils/geofence';
import { authenticateWithBiometric } from '../utils/biometric';
import { Employee } from '@repo/types';
import { useTranslation } from 'react-i18next';

type AuthState =
  | { isLoading: true; isAuthenticated: false; user: null; token: null }
  | { isLoading: false; isAuthenticated: true; user: Employee; token: string }
  | { isLoading: false; isAuthenticated: false; user: null; token: null };

type AuthContextType = AuthState & {
  login: (token: string, user: Employee) => Promise<void>;
  biometricLogin: () => Promise<boolean>;
  logout: (reason?: string) => Promise<void>;
  refreshUser: () => Promise<void>;
  enableBiometric: (employeeId: string, password: string) => Promise<boolean>;
  disableBiometric: () => Promise<void>;
  isBiometricEnabled: boolean;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: null,
    isLoading: true,
    isAuthenticated: false,
  });
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const { t } = useTranslation();

  const logout = useCallback(async (reason?: string) => {
    // reason could be used for showing specific alerts in the future
    // but for now we just handle the cleanup
    disconnectSocket();
    await stopGeofencing();

    // We don't want to clear biometric settings on logout usually
    // but we should clear the login token and user info
    await storage.removeItem(STORAGE_KEYS.USER_TOKEN);
    await storage.removeItem(STORAGE_KEYS.USER_INFO);

    setState({
      user: null,
      token: null,
      isLoading: false,
      isAuthenticated: false,
    });
  }, []);

  const login = useCallback(async (token: string, user: Employee) => {
    await storage.setItem(STORAGE_KEYS.USER_TOKEN, token);
    await storage.setItem(STORAGE_KEYS.USER_INFO, user);

    setState({
      user,
      token,
      isLoading: false,
      isAuthenticated: true,
    });
  }, []);

  const disableBiometric = useCallback(async () => {
    // Try to revoke on server if we have a token
    const token = await storage.getItem(STORAGE_KEYS.BIOMETRIC_TOKEN);
    if (token) {
      try {
        await client.post('/api/employee/auth/biometric/revoke', { biometricToken: token });
      } catch (e) {
        console.warn('Failed to revoke biometric token on server', e);
      }
    }

    await storage.removeItem(STORAGE_KEYS.BIOMETRIC_TOKEN);
    await storage.removeItem(STORAGE_KEYS.BIOMETRIC_ENABLED);

    // Clean up legacy keys just in case
    await storage.removeItem(STORAGE_KEYS.SAVED_EMPLOYEE_ID);
    // await storage.removeItem(STORAGE_KEYS.SAVED_PASSWORD); // Removed from keys but good to clean if exists

    setBiometricEnabled(false);
  }, []);

  const enableBiometric = useCallback(
    async (employeeId: string, password: string) => {
      try {
        // Exchange password for a long-lived biometric refresh token
        const response = await client.post('/api/employee/auth/biometric/setup', {
          employeeId,
          password,
          deviceInfo: 'Mobile App', // Could use expo-device to get model
        });

        if (response.data.biometricToken) {
          const s1 = await storage.setItem(STORAGE_KEYS.BIOMETRIC_TOKEN, response.data.biometricToken);
          const s2 = await storage.setItem(STORAGE_KEYS.BIOMETRIC_ENABLED, true);

          // Legacy support: save employeeId if needed for UI, but not password
          await storage.setItem(STORAGE_KEYS.SAVED_EMPLOYEE_ID, employeeId);

          if (s1 && s2) {
            setBiometricEnabled(true);
            return true;
          }
        }

        console.error('Failed to save biometric credentials');
        await disableBiometric();
        return false;
      } catch (error) {
        console.error('Failed to enable biometric:', error);
        return false;
      }
    },
    [disableBiometric]
  );

  const biometricLogin = useCallback(async () => {
    try {
      const isEnabled = await storage.getItem(STORAGE_KEYS.BIOMETRIC_ENABLED);
      if (!isEnabled) return false;

      // ENFORCE: Biometric verification happens HERE in the trusted context
      const authResult = await authenticateWithBiometric(t('biometric.promptMessage'));
      if (!authResult.success) {
        return false;
      }

      const biometricToken = await storage.getItem(STORAGE_KEYS.BIOMETRIC_TOKEN);
      if (!biometricToken) return false;

      const response = await client.post('/api/employee/auth/biometric/login', {
        biometricToken,
      });

      const data = response.data;
      if (data.token && data.employee) {
        await login(data.token, data.employee);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Biometric login failed:', error);
      return false;
    }
  }, [login, t]);

  const refreshUser = useCallback(async () => {
    try {
      const res = await client.get('/api/employee/my/profile');
      const user = res.data.employee;
      await storage.setItem(STORAGE_KEYS.USER_INFO, user);
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
        const [token, user, isBioEnabled] = await Promise.all([
          storage.getItem(STORAGE_KEYS.USER_TOKEN),
          storage.getItem(STORAGE_KEYS.USER_INFO),
          storage.getItem(STORAGE_KEYS.BIOMETRIC_ENABLED),
        ]);

        setBiometricEnabled(!!isBioEnabled);

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

      Alert.alert(t('dashboard.sessionExpiredTitle'), t('dashboard.sessionExpiredMessage'), [
        {
          text: t('common.ok', 'OK'),
          onPress: async () => {
            await logout('session_expired');
            isHandling401 = false;
          },
        },
      ]);
    });

    return () => {
      cleanup();
    };
  }, [state.isAuthenticated, logout, t]);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        biometricLogin,
        logout,
        refreshUser,
        enableBiometric,
        disableBiometric,
        isBiometricEnabled: biometricEnabled,
      }}
    >
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
