import { useRouter } from 'next/navigation';

export function useGuardApi() {
  const router = useRouter();

  const fetchWithAuth = async (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const res = await fetch(input, init);
      if (res.status === 401) {
        // Redirect to login on 401 Unauthorized
        router.push('/guard/login');
      }
      return res;
    } catch (error) {
      throw error;
    }
  };

  return { fetchWithAuth };
}
