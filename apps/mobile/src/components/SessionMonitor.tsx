import { useEffect } from 'react';
import { Alert } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { client } from '../api/client';
import { getSocket, disconnectSocket } from '../api/socket';
import { storage } from '../utils/storage';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

export default function SessionMonitor() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();

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

  const handleLogout = async (reason: string) => {
    disconnectSocket();
    await storage.clear();

    if (reason === 'logged_in_elsewhere') {
      Alert.alert(t('dashboard.sessionExpiredTitle'), t('dashboard.sessionExpiredMessage'), [
        { text: 'OK', onPress: () => router.replace('/(auth)/login') },
      ]);
    } else {
      router.replace('/(auth)/login');
    }
  };

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
  }, [queryClient]);

  return null;
}
