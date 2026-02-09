import { useEffect, useCallback } from 'react';
import { Alert } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { client } from '../api/client';
import { getSocket, disconnectSocket } from '../api/socket';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';

export default function SessionMonitor() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { logout } = useAuth();

  // Keep legacy polling as a secondary safety measure, but increase interval
  useQuery({
    queryKey: ['session-monitor'],
    queryFn: async () => {
      const res = await client.get('/api/employee/auth/check');
      return res.data;
    },
    refetchInterval: 5 * 60000, // Reduced from 15s to 5 minutes
    retry: false,
  });

  const handleLogout = useCallback(async (reason: string) => {
    if (reason === 'logged_in_elsewhere') {
      // Disconnect socket immediately to prevent connection errors
      disconnectSocket();
      
      Alert.alert(t('dashboard.sessionExpiredTitle'), t('dashboard.sessionExpiredMessage'), [
        { 
          text: 'OK', 
          onPress: async () => {
            await logout(reason);
            router.replace('/(auth)/login');
          }
        },
      ]);
    } else {
      await logout(reason);
      router.replace('/(auth)/login');
    }
  }, [logout, router, t]);

  useEffect(() => {
    let isMounted = true;

    const setupSocket = async () => {
      const socket = await getSocket();
      if (!socket || !isMounted) return;

      socket.on('auth:force_logout', (data: { reason: string }) => {
        handleLogout(data.reason);
      });

      socket.on('shift:updated', () => {
        // Invalidate queries to refresh dashboard/shift data
        queryClient.invalidateQueries({ queryKey: ['active-shift'] });
        queryClient.invalidateQueries({ queryKey: ['shifts'] });
      });
    };

    setupSocket();

    return () => {
      isMounted = false;
      // We don't disconnectSocket here as it's a global singleton
    };
  }, [handleLogout, queryClient]);

  return null;
}
