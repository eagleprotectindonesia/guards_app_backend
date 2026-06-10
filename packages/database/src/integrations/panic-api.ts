export interface PanicSubscriptionStats {
  total: number;
  active: number;
  expired: number;
  cancelled: number;
  pending: number;
  endingIn30Days: number;
}

export interface PanicSubscriptionStatsResponse {
  statusCode: number;
  data: {
    subscriptions: PanicSubscriptionStats;
  };
}

const PANIC_APP_URL = process.env.PANIC_APP_URL;
const PANIC_APP_API_KEY = process.env.PANIC_APP_API_KEY;

/**
 * Generic helper to fetch data from the Panic App API.
 */
async function fetchPanicApi<T>(endpoint: string): Promise<T> {
  if (!PANIC_APP_URL || !PANIC_APP_API_KEY) {
    throw new Error('PANIC_APP_URL or PANIC_APP_API_KEY is not configured');
  }

  // Remove trailing slash if present, then combine with the endpoint
  const url = `${PANIC_APP_URL.replace(/\/$/, '')}${endpoint}`;

  try {
    const response = await fetch(url, {
      headers: {
        'x-api-key': PANIC_APP_API_KEY,
      },
      cache: 'no-store',
    } as any);

    if (!response.ok) {
      throw new Error(`Failed to fetch from Panic API (${endpoint}): ${response.status} ${response.statusText}`);
    }

    return (await response.json()) as T;
  } catch (error) {
    console.error(`Error in Panic API call (${endpoint}):`, error);
    throw error;
  }
}

/**
 * Fetches subscription statistics from the Panic App API.
 */
export async function getPanicSubscriptionStats(): Promise<PanicSubscriptionStatsResponse> {
  return fetchPanicApi<PanicSubscriptionStatsResponse>('/external/subscriptions/stats');
}
