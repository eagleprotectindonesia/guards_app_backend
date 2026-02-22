import { useQuery } from '@tanstack/react-query';
import { client } from '../api/client';
import { storage } from '../utils/storage';
import { SETTINGS_CACHE_KEY } from '../utils/backgroundTasks';
import { queryKeys } from '../api/queryKeys';

export interface SystemSettings {
  GEOFENCE_GRACE_MINUTES: number;
  LOCATION_DISABLED_GRACE_MINUTES: number;
  ENABLE_LOCATION_MONITORING: boolean;
}

export const useSettings = () => {
  return useQuery<SystemSettings>({
    queryKey: queryKeys.settings,
    queryFn: async () => {
      const response = await client.get('/api/employee/settings');
      await storage.setItem(SETTINGS_CACHE_KEY, response.data);
      return response.data;
    },
    staleTime: 1000 * 60 * 60, // 1 hour
  });
};
