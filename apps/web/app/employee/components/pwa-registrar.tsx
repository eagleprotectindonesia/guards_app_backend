'use client';

import { useEffect } from 'react';

export default function PwaRegistrar() {
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/employee/sw.js', { scope: '/employee/' })
        .then((registration) => {
          console.log('Employee PWA Registered with scope:', registration.scope);
        })
        .catch((error) => {
          console.error('Employee PWA Registration failed:', error);
        });
    }
  }, []);

  return null;
}