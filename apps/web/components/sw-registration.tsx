'use client';

import { useEffect } from 'react';

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (
      ('serviceWorker' in navigator && window.location.protocol === 'https:') ||
      window.location.hostname === 'localhost'
    ) {
      const registerSW = async () => {
        try {
          const registration = await navigator.serviceWorker.register('/sw.js');
          console.log('SW registered:', registration.scope);
        } catch (error) {
          console.error('SW registration failed:', error);
        }
      };

      registerSW();
    }
  }, []);

  return null;
}
