'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAlerts } from '../context/alert-context';
import Link from 'next/link';
import { Bell, X } from 'lucide-react';

export default function GlobalAlertManager() {
  const { alerts } = useAlerts();
  const pathname = usePathname();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const activeAlerts = alerts.filter(
    (alert) => !alert.acknowledgedAt && !alert.resolvedAt && alert.status !== 'need_attention'
  );
  const hasActiveAlerts = activeAlerts.length > 0;
  
  const [isMinimized, setIsMinimized] = useState(false);
  const [prevCount, setPrevCount] = useState(activeAlerts.length);

  // Auto-expand if new alerts arrive
  if (activeAlerts.length !== prevCount) {
    setPrevCount(activeAlerts.length);
    if (activeAlerts.length > prevCount) {
      setIsMinimized(false);
    }
  }

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
      {/* Floating Alert UI - Only if NOT on Dashboard/Alerts Page */}
      {showVisuals && (
        isMinimized ? (
          <button
            onClick={() => setIsMinimized(false)}
            className="bg-red-600 text-white p-3 rounded-full shadow-2xl hover:bg-red-700 transition-all animate-in zoom-in active:scale-95 group"
            title="Show active alerts"
          >
            <div className="relative">
              <Bell className="h-6 w-6" />
              <span className="absolute -top-2 -right-2 bg-white text-red-600 text-[10px] font-bold h-5 w-5 rounded-full flex items-center justify-center border-2 border-red-600 shadow-sm">
                {activeAlerts.length}
              </span>
              <span className="animate-ping absolute inset-0 rounded-full bg-red-400 opacity-40"></span>
            </div>
          </button>
        ) : (
          <div className="bg-white border border-red-100 rounded-xl shadow-2xl p-4 w-80 animate-in slide-in-from-bottom-5">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2 text-red-600">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                </span>
                <span className="font-bold">ALARM TRIGGERED</span>
              </div>
              <button
                onClick={() => setIsMinimized(true)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors"
                title="Minimize"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-sm text-gray-600 mb-3">
              {activeAlerts.length} active alert{activeAlerts.length === 1 ? '' : 's'} require immediate attention.
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
        )
      )}
    </div>
  );
}
