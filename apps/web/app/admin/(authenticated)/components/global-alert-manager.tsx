'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useAlerts } from '../context/alert-context';
import Link from 'next/link';

export default function GlobalAlertManager() {
  const { alerts } = useAlerts();
  const pathname = usePathname();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Audio Logic
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio('/audios/alarm3.wav');
      audioRef.current.loop = true;
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    };
  }, []);

  const hasActiveAlerts = alerts.some(alert => !alert.acknowledgedAt && !alert.resolvedAt && alert.status !== 'need_attention');

  useEffect(() => {
    const unlockAudio = () => {
      if (audioRef.current) {
        const playPromise = audioRef.current.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              if (!hasActiveAlerts) {
                audioRef.current?.pause();
                if (audioRef.current) audioRef.current.currentTime = 0;
              }
              document.removeEventListener('click', unlockAudio);
              document.removeEventListener('keydown', unlockAudio);
            })
            .catch(() => {
              // console.warn('Audio unlock failed:', error);
            });
        }
      }
    };

    document.addEventListener('click', unlockAudio);
    document.addEventListener('keydown', unlockAudio);

    return () => {
      document.removeEventListener('click', unlockAudio);
      document.removeEventListener('keydown', unlockAudio);
    };
  }, [hasActiveAlerts]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (hasActiveAlerts) {
      if (audio.paused) {
        audio.play().catch(() => {
          // Autoplay prevented.
          // The document listeners will eventually handle this when user interacts.
        });
      }
    } else {
      if (!audio.paused) {
        audio.pause();
        audio.currentTime = 0;
      }
    }
  }, [hasActiveAlerts]);

  const isOnDashboard = pathname === '/admin/dashboard';
  const isOnAlertsPage = pathname === '/admin/alerts';
  const showVisuals = !isOnDashboard && !isOnAlertsPage && hasActiveAlerts;

  if (!hasActiveAlerts) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 items-end">
      {/* Floating Alert Card - Only if NOT on Dashboard */}
      {showVisuals && (
        <div className="bg-white border border-red-100 rounded-xl shadow-xl p-4 w-80 animate-in slide-in-from-bottom-5">
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2 text-red-600">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
              </span>
              <span className="font-bold">ALARM TRIGGERED</span>
            </div>
          </div>

          <p className="text-sm text-gray-600 mb-3">
            {alerts.length} active alert{alerts.length === 1 ? '' : 's'} require immediate attention.
          </p>

          <div className="flex gap-2">
            <Link
              href="/admin/dashboard"
              className="flex-1 bg-red-600 text-white text-center py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
            >
              Go to Dashboard
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
