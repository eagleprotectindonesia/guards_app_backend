'use client';

import { useEffect, useRef } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@repo/shared';
import { useAlerts } from '../context/alert-context';

export default function AlertMuteButton() {
  const { isMuted, setIsMuted, alerts, isAlertsInitialized } = useAlerts();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const activeAlerts = alerts.filter(
    alert => !alert.acknowledgedAt && !alert.resolvedAt && alert.status !== 'need_attention'
  );
  const hasActiveAlerts = activeAlerts.length > 0;
  const shouldPlaySound = isAlertsInitialized && hasActiveAlerts && !isMuted;

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

  return (
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
  );
}
