import { useQuery } from '@tanstack/react-query';
import { client } from '../api/client';

export interface SystemSettings {
  GEOFENCE_GRACE_MINUTES: number;
  LOCATION_DISABLED_GRACE_MINUTES: number;
}

export const useSettings = () => {
  return useQuery<SystemSettings>({
    queryKey: ['settings'],
    queryFn: async () => {
      const response = await client.get('/api/employee/settings');
      return response.data;
    },
    staleTime: 1000 * 60 * 60, // 1 hour
  });
};
