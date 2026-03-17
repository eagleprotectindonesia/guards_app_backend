import { useEffect, useCallback, useRef } from 'react';
import { useAlert } from '../contexts/AlertContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { client } from '../api/client';
import { getSocket, disconnectSocket } from '../api/socket';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { queryKeys } from '../api/queryKeys';
import { incrementTelemetryCounter } from '../utils/telemetry';
import { AppState, AppStateStatus } from 'react-native';

export default function SessionMonitor() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { logout, isAuthenticated } = useAuth();
  const { showAlert } = useAlert();
  const isResumeValidationInFlightRef = useRef(false);

  // Keep legacy polling as a secondary safety measure, but increase interval
  // IMPORTANT: Only run when authenticated to avoid triggering 401s during login
  useQuery({
    queryKey: queryKeys.sessionMonitor,
    queryFn: async () => {
      const res = await client.get('/api/employee/auth/check');
      return res.data;
    },
    refetchInterval: 5 * 60000, // Reduced from 15s to 5 minutes
    retry: false,
    enabled: isAuthenticated, // Only run when authenticated
  });

  const handleLogout = useCallback(
    async (reason: string) => {
      if (reason === 'logged_in_elsewhere') {
        // Disconnect socket immediately to prevent connection errors
        disconnectSocket();

        showAlert(t('dashboard.sessionExpiredTitle'), t('dashboard.sessionExpiredMessage'), [
          {
            text: 'OK',
            onPress: async () => {
              await logout(reason);
              router.replace('/(auth)/login');
            },
          },
        ]);
      } else {
        await logout(reason);
        router.replace('/(auth)/login');
      }
    },
    [logout, router, t, showAlert]
  );

  const refreshShiftQueries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.shifts.active });
    queryClient.invalidateQueries({ queryKey: queryKeys.shifts.list });
  }, [queryClient]);

  const validateSessionOnForeground = useCallback(async () => {
    if (!isAuthenticated || isResumeValidationInFlightRef.current) {
      return;
    }

    isResumeValidationInFlightRef.current = true;

    try {
      await client.get('/api/employee/auth/check');
      refreshShiftQueries();
    } catch (error: any) {
      if (error?.response?.status === 401) {
        await handleLogout('logged_in_elsewhere');
      } else {
        console.error('[SessionMonitor] Foreground auth validation failed', error);
        refreshShiftQueries();
      }
    } finally {
      isResumeValidationInFlightRef.current = false;
    }
  }, [handleLogout, isAuthenticated, refreshShiftQueries]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    let isMounted = true;
    let cleanupSocketListeners: (() => void) | undefined;

    const setupSocket = async () => {
      const socket = await getSocket();
      if (!socket || !isMounted) return;

      const onForceLogout = (data: { reason: string }) => {
        incrementTelemetryCounter('session.force_logout');
        handleLogout(data.reason);
      };

      const onConnectError = (err: Error) => {
        // If the server rejects the connection with "Unauthorized", it means
        // our token is invalid (likely revoked/version mismatch).
        if (err.message === 'Unauthorized') {
          handleLogout('logged_in_elsewhere');
        }
      };

      const onShiftUpdated = () => {
        refreshShiftQueries();
      };

      socket.on('auth:force_logout', onForceLogout);
      socket.on('connect_error', onConnectError);
      socket.on('shift:updated', onShiftUpdated);

      cleanupSocketListeners = () => {
        socket.off('auth:force_logout', onForceLogout);
        socket.off('connect_error', onConnectError);
        socket.off('shift:updated', onShiftUpdated);
      };
    };

    setupSocket();

    return () => {
      isMounted = false;
      cleanupSocketListeners?.();
    };
  }, [handleLogout, queryClient, isAuthenticated, refreshShiftQueries]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    let previousAppState: AppStateStatus = AppState.currentState;
    const subscription = AppState.addEventListener('change', nextAppState => {
      const isRealForeground = previousAppState === 'background' && nextAppState === 'active';
      previousAppState = nextAppState;

      if (isRealForeground) {
        void validateSessionOnForeground();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [isAuthenticated, validateSessionOnForeground]);

  return null;
}
