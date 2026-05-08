'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'react-hot-toast';
import { onMessage, getToken } from 'firebase/messaging';
import { useTranslation } from 'react-i18next';
import { usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useEmployeeApi } from './use-employee-api';
import { getFirebaseWebMessaging, getFirebaseWebVapidKey } from '@/lib/firebase-web';

const CHAT_SOUND_PATH = '/audios/chat.wav';

function isStandaloneMode() {
  if (typeof window === 'undefined') return false;

  const standaloneMedia = window.matchMedia?.('(display-mode: standalone)').matches;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

  return Boolean(standaloneMedia || iosStandalone);
}

export function useEmployeePushNotifications(employeeId?: string) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const { fetchWithAuth } = useEmployeeApi();
  const queryClient = useQueryClient();
  const registeredTokenRef = useRef<string | null>(null);
  const requestedUserRef = useRef<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio(CHAT_SOUND_PATH);
    }
  }, []);

  useEffect(() => {
    if (!employeeId || !isStandaloneMode() || requestedUserRef.current === employeeId) {
      return;
    }

    let cancelled = false;

    const setupPush = async () => {
      requestedUserRef.current = employeeId;

      const vapidKey = getFirebaseWebVapidKey();
      if (!vapidKey) return;

      const messaging = await getFirebaseWebMessaging();
      if (!messaging) return;

      const permission = await Notification.requestPermission();
      if (permission !== 'granted' || cancelled) {
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });

      if (!token || cancelled || registeredTokenRef.current === token) {
        return;
      }

      if (registeredTokenRef.current) {
        await fetchWithAuth('/api/employee/fcm-token', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: registeredTokenRef.current }),
        });
      }

      await fetchWithAuth('/api/employee/fcm-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, deviceInfo: `web:${navigator.userAgent}` }),
      });

      registeredTokenRef.current = token;
    };

    void setupPush();

    return () => {
      cancelled = true;
    };
  }, [employeeId, fetchWithAuth]);

  useEffect(() => {
    if (!employeeId || !isStandaloneMode()) {
      return;
    }

    let active = true;
    let unsubscribe: (() => void) | null = null;

    const setupForegroundListener = async () => {
      const messaging = await getFirebaseWebMessaging();
      if (!messaging || !active) {
        return;
      }

      unsubscribe = onMessage(messaging, payload => {
        const data = payload.data || {};
        queryClient.invalidateQueries({ queryKey: ['chat', 'unread'] });

        if (data.type === 'leave_request_status_changed') {
          const status = data.status === 'approved' ? 'approved' : 'rejected';
          toast.success(
            status === 'approved'
              ? t('notifications.leave_approved', 'Leave request approved')
              : t('notifications.leave_rejected', 'Leave request rejected')
          );
          return;
        }

        if (data.type === 'shift_reminder') {
          toast(
            data.phase === 'end'
              ? t('notifications.shift_end_reminder', 'Your shift has ended. Please complete your end-of-shift flow.')
              : t('notifications.shift_reminder', 'Your shift starts in less than 30 minutes.')
          );
          return;
        }

        if (data.type === 'chat' && pathname !== '/employee/chat') {
          toast(data.messagePreview || t('notifications.chat_default_body', 'You have a new message'));
          if (audioRef.current) {
            audioRef.current.currentTime = 0;
            audioRef.current.play().catch(() => {});
          }
        }
      });
    };

    void setupForegroundListener();

    return () => {
      active = false;
      if (unsubscribe) unsubscribe();
    };
  }, [employeeId, pathname, queryClient, t]);
}
