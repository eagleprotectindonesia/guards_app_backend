'use client';

import { useEffect, useRef } from 'react';
import { useAlerts } from '../context/alert-context';
import { Volume2, VolumeX, Bell, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function AlertNotifications() {
  const { isMuted, setIsMuted, alerts, isInitialized } = useAlerts();
  const pathname = usePathname();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const activeAlerts = alerts.filter(
    alert => !alert.acknowledgedAt && !alert.resolvedAt && alert.status !== 'need_attention'
  );
  const hasActiveAlerts = activeAlerts.length > 0;
  const shouldPlaySound = isInitialized && hasActiveAlerts && !isMuted;

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
        const audio = audioRef.current;
        if (!shouldPlaySound) {
          audio.muted = true;
        }

        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              if (!shouldPlaySound) {
                audio.pause();
                audio.currentTime = 0;
                audio.muted = false;
              }
              document.removeEventListener('click', unlockAudio);
              document.removeEventListener('keydown', unlockAudio);
            })
            .catch(() => {
              audio.muted = false;
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
  }, [shouldPlaySound]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (hasActiveAlerts && !isMuted) {
      if (audio.paused) {
        audio.play().catch(() => {});
      }
    } else {
      if (!audio.paused) {
        audio.pause();
        audio.currentTime = 0;
      }
    }
  }, [hasActiveAlerts, isMuted]);

  if (!hasActiveAlerts) return null;

  const isOnDashboard = pathname === '/admin/dashboard';
  const isOnAlertsPage = pathname === '/admin/alerts';
  const showAlarmWarning = !isOnDashboard && !isOnAlertsPage && hasActiveAlerts;

  return (
    <div className="flex items-center gap-2 mr-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'relative rounded-full',
              showAlarmWarning &&
                'bg-red-50 dark:bg-red-950/30 text-red-600 hover:text-red-700 hover:bg-red-100 dark:hover:bg-red-900/40'
            )}
          >
            <Bell className={cn('h-5 w-5', showAlarmWarning && 'animate-bounce')} />
            <span className="absolute -top-1.5 -right-1.5 bg-red-600 text-white text-xs font-bold h-5 w-5 rounded-full flex items-center justify-center border-2 border-background shadow-sm">
              {activeAlerts.length}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-4">
          <div className="flex items-center gap-2 text-red-600 dark:text-red-400 mb-3">
            <AlertTriangle className="h-5 w-5 animate-pulse" />
            <span className="font-bold text-sm uppercase tracking-wider">Alarm Triggered</span>
          </div>

          <p className="text-sm text-muted-foreground mb-4">
            {activeAlerts.length} active alert{activeAlerts.length === 1 ? '' : 's'} require immediate attention.
          </p>

          <div className="flex flex-col gap-2">
            <Button asChild className="w-full bg-red-600 hover:bg-red-700 text-white border-0">
              <Link href="/admin/dashboard">Go to Dashboard</Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href="/admin/alerts">View All Alerts</Link>
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsMuted(!isMuted)}
        className={cn(
          'rounded-full',
          !isMuted && 'text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30'
        )}
        title={isMuted ? 'Unmute alarm' : 'Mute alarm'}
      >
        {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
      </Button>
    </div>
  );
}
