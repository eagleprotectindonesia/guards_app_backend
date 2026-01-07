import { useQuery } from '@tanstack/react-query';
import { client } from '../api/client';

export default function SessionMonitor() {
  // Poll profile every 5 seconds to check session validity
  useQuery({
    queryKey: ['session-monitor'],
    queryFn: async () => {
      const res = await client.get('/api/guard/auth/check');
      return res.data;
    },
    refetchInterval: 15000,
    retry: false,
    // We don't need to handle onError here because the global interceptor 
    // in client.ts (setup in DashboardScreen) handles 401s.
  });

  return null;
}
