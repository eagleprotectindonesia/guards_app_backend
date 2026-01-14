import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

export function useEmployeeApi() {
  const router = useRouter();

  const fetchWithAuth = useCallback(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      try {
        const res = await fetch(input, init);
        if (res.status === 401) {
          // Redirect to login on 401 Unauthorized
          router.push('/employee/login');
        }
        return res;
      } catch (error) {
        throw error;
      }
    },
    [router]
  );

  return { fetchWithAuth };
}