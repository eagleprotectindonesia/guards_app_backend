import { useCallback } from 'react';
import { UnauthorizedError } from '../../auth-errors';

export function useEmployeeApi() {
  const fetchWithAuth = useCallback(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const res = await fetch(input, init);
      if (res.status === 401) {
        throw new UnauthorizedError();
      }
      return res;
    },
    []
  );

  return { fetchWithAuth };
}
