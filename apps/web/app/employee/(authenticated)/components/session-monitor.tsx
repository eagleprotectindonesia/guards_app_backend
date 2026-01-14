'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SessionMonitor() {
  const router = useRouter();

  useEffect(() => {
    let eventSource: EventSource | null = null;

    const connect = () => {
      eventSource = new EventSource('/api/employee/notifications/stream');

      eventSource.onmessage = () => {
        // Handle generic messages if any
      };

      eventSource.addEventListener('force_logout', async () => {
        try {
          // Perform logout
          await fetch('/api/auth/employee/logout', { method: 'POST' });
          // Redirect to login
          router.push('/employee/login?reason=concurrent_login');
        } catch (error) {
          console.error('Logout failed', error);
          // Force redirect anyway
          router.push('/employee/login');
        }
      });

      eventSource.addEventListener('shift_updated', () => {
        // Refresh the current route to pick up shift changes
        router.refresh();
        // Also dispatch a custom event for client components to listen to
        window.dispatchEvent(new CustomEvent('shift_updated'));
      });

      eventSource.onerror = () => {
        // If 401 or similar, we might want to stop.
        // EventSource doesn't give status codes easily in onerror.
        // But if connection fails repeatedly, we usually just let it retry.
        // console.error('SSE Error:', err);
      };
    };

    connect();

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [router]);

  return null;
}