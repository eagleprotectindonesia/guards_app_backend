import { useQuery } from '@tanstack/react-query';
import { client } from '../api/client';
import { Employee } from '@repo/types';
import { queryKeys } from '../api/queryKeys';

type ProfileResponse = {
  employee: Employee & { mustChangePassword?: boolean };
};

export function useProfile() {
  return useQuery<ProfileResponse>({
    queryKey: queryKeys.profile,
    queryFn: async () => {
      const res = await client.get('/api/employee/my/profile');
      return res.data;
    },
  });
}
