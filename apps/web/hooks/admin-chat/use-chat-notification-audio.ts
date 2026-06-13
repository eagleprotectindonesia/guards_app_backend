'use client';

import { useCallback, useEffect, useRef } from 'react';

export function useChatNotificationAudio(source = '/audios/chat.wav') {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio(source);
    }

    const unlockAudio = () => {
      if (!audioRef.current) return;
      audioRef.current
        .play()
        .then(() => {
          audioRef.current?.pause();
          if (audioRef.current) audioRef.current.currentTime = 0;
          document.removeEventListener('click', unlockAudio);
          document.removeEventListener('keydown', unlockAudio);
        })
        .catch(() => {});
    };

    document.addEventListener('click', unlockAudio);
    document.addEventListener('keydown', unlockAudio);

    return () => {
      document.removeEventListener('click', unlockAudio);
      document.removeEventListener('keydown', unlockAudio);
    };
  }, [source]);

  const playNotificationSound = useCallback(() => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = 0;
    audioRef.current.play().catch(() => {});
  }, []);

  return { playNotificationSound };
}
