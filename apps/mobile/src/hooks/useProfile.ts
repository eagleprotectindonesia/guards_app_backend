import { useQuery } from '@tanstack/react-query';
import { client } from '../api/client';
import { Employee } from '@repo/types';
import { queryKeys } from '../api/queryKeys';
import { useAuth } from '../contexts/AuthContext';

type ProfileResponse = {
  employee: Employee & { mustChangePassword?: boolean };
};

export function useProfile() {
  const { isAuthenticated } = useAuth();

  return useQuery<ProfileResponse>({
    queryKey: queryKeys.profile,
    enabled: isAuthenticated,
    queryFn: async () => {
      const res = await client.get('/api/employee/my/profile');
      return res.data;
    },
  });
}
