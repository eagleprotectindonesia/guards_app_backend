'use client';

import { useEffect } from 'react';

export default function PwaRegistrar() {
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/guard/sw.js', { scope: '/guard/' })
        .then((registration) => {
          console.log('Guard PWA Registered with scope:', registration.scope);
        })
        .catch((error) => {
          console.error('Guard PWA Registration failed:', error);
        });
    }
  }, []);

  return null;
}