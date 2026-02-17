import { useQuery } from '@tanstack/react-query';
import { client } from '../api/client';
import { Employee } from '@repo/types';

type ProfileResponse = {
  employee: Employee & { mustChangePassword?: boolean };
};

export function useProfile() {
  return useQuery<ProfileResponse>({
    queryKey: ['profile'],
    queryFn: async () => {
      const res = await client.get('/api/employee/my/profile');
      return res.data;
    },
  });
}
