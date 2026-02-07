'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSocket } from '@/components/socket-provider';

export default function SessionMonitor() {
  const router = useRouter();
  const { socket, isConnected } = useSocket();

  useEffect(() => {
    if (!socket || !isConnected) return;

    const handleForceLogout = async () => {
      try {
        // Perform logout
        await fetch('/api/employee/auth/logout', { method: 'POST' });
        // Redirect to login
        router.push('/employee/login?reason=concurrent_login');
      } catch (error) {
        console.error('Logout failed', error);
        // Force redirect anyway
        router.push('/employee/login');
      }
    };

    const handleShiftUpdated = () => {
      // Refresh the current route to pick up shift changes
      router.refresh();
      // Also dispatch a custom event for client components to listen to
      window.dispatchEvent(new CustomEvent('shift_updated'));
    };

    socket.on('auth:force_logout', handleForceLogout);
    socket.on('shift:updated', handleShiftUpdated);

    return () => {
      socket.off('auth:force_logout', handleForceLogout);
      socket.off('shift:updated', handleShiftUpdated);
    };
  }, [socket, isConnected, router]);

  return null;
}
