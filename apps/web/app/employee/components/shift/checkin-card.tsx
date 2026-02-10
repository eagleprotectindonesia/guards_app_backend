'use client';

import { useEffect, useState, useRef } from 'react';
import type { ShiftWithRelationsDto } from '@/types/shifts';
import { useCheckIn } from '@/app/employee/(authenticated)/hooks/use-employee-queries';
import { CheckInWindowResult } from '@/lib/scheduling';
import { Card, CardContent } from '@/components/ui/card';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

type ActiveShiftWithWindow = ShiftWithRelationsDto & {
  checkInWindow?: CheckInWindowResult;
};

type CheckInCardProps = {
  activeShift: ActiveShiftWithWindow | null;
  loading: boolean;
  status: string;
  currentTime: Date;
  setStatus: (status: string) => void;
  fetchShift: () => Promise<unknown>;
};

export default function CheckInCard({ activeShift, status, setStatus, fetchShift }: CheckInCardProps) {
  const { t } = useTranslation();
  const checkInMutation = useCheckIn();
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [canCheckIn, setCanCheckIn] = useState(false);
  const expiryRefreshRef = useRef<string | null>(null);

  // Sync state with activeShift window data
  useEffect(() => {
    if (!activeShift?.checkInWindow) {
      return;
    }
    const formatTime = (seconds: number) => {
      if (seconds > 60) return `${Math.ceil(seconds / 60)} ${t('common.minutes')}`;
      return `${seconds} ${t('common.seconds')}`;
    };

    const updateTimer = () => {
      const window = activeShift.checkInWindow!;
      const now = new Date().getTime();
      const currentSlotStartMs = new Date(window.currentSlotStart).getTime();
      const currentSlotEndMs = new Date(window.currentSlotEnd).getTime();
      const nextSlotStartMs = new Date(window.nextSlotStart).getTime();

      let isWindowOpen = false;
      let message = '';

      // 1. Auto-refresh if we pass the window end time while in early/open state (Expiry)
      if ((window.status === 'early' || window.status === 'open') && now > currentSlotEndMs) {
        const slotKey = new Date(window.currentSlotStart).toISOString();
        if (expiryRefreshRef.current !== slotKey) {
          expiryRefreshRef.current = slotKey;
          // Trigger refresh to get 'late' status from server
          fetchShift().catch(console.error);
        }
      }

      // 2. Auto-refresh if we reach the next slot start time while in late/completed state (Opening)
      if ((window.status === 'late' || window.status === 'completed') && now >= nextSlotStartMs) {
        const nextSlotKey = new Date(window.nextSlotStart).toISOString();
        if (expiryRefreshRef.current !== nextSlotKey) {
          expiryRefreshRef.current = nextSlotKey;
          // Trigger refresh to get 'open' status for the new slot
          fetchShift().catch(console.error);
        }
      }

      if (window.status === 'completed') {
        // Waiting for next slot
        const diff = Math.ceil((nextSlotStartMs - now) / 1000);
        if (diff > 0) {
          message = t('checkin.nextIn', { time: formatTime(diff) });
        } else {
          // We might be in a drift state where frontend time > next slot but API hasn't updated.
          // In this case, we should probably fetchShift?
          // For now, just say "Opening..."
          message = t('checkin.preparingNext');
        }
        isWindowOpen = false;
      } else if (window.status === 'early') {
        // Early for the very first slot (or general early)
        const diff = Math.ceil((currentSlotStartMs - now) / 1000);
        if (diff > 0) {
          message = t('checkin.opensIn', { time: formatTime(diff) });
        } else {
          // Check if we also passed the end time (missed the window locally)
          const endDiff = Math.ceil((currentSlotEndMs - now) / 1000);
          if (endDiff > 0) {
            message = t('checkin.openStatus');
            isWindowOpen = true;
          } else {
            message = t('checkin.lateStatus', { defaultValue: 'You are late for this check-in' });
            isWindowOpen = true;
            fetchShift().catch(console.error);
          }
        }
      } else if (window.status === 'open') {
        // Open now, counting down to close
        const diff = Math.ceil((currentSlotEndMs - now) / 1000);
        if (diff > 0) {
          message = t('checkin.remainingTime', { time: diff });
          isWindowOpen = true;
        } else {
          message = t('checkin.lateStatus', { defaultValue: 'You are late for this check-in' });
          isWindowOpen = true;
          fetchShift().catch(console.error);
        }
      } else if (window.status === 'late') {
        // Late for current, but now we allow check-in
        message = t('checkin.lateStatus', { defaultValue: 'You are late for this check-in' });
        isWindowOpen = true;
      }

      setTimeLeft(message);
      setCanCheckIn(isWindowOpen);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [activeShift, fetchShift, t]);

  const handleCheckIn = async () => {
    if (!activeShift) return;

    let locationData: { lat: number; lng: number } | undefined;

    if (navigator.geolocation) {
      setStatus(t('checkin.gettingLocation'));
      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0,
          });
        });
        locationData = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
      } catch (error) {
        console.error('Geolocation failed or timed out:', error);
        setStatus(t('checkin.locationRequired'));
        return;
      }
    } else {
      setStatus(t('checkin.locationError'));
      return;
    }

    setStatus(t('checkin.processing'));
    try {
      const data = await checkInMutation.mutateAsync({
        shiftId: activeShift.id,
        location: locationData,
      });

      if (data.isLastSlot) {
        toast.success(t('checkin.shiftCompletedTitle'));
      }
      setStatus('');
    } catch (err: unknown) {
      const errorData = err as { error?: string; message?: string };
      if (errorData.error === 'Already checked in for this interval') {
        if (activeShift.checkInWindow?.isLastSlot) {
          toast.success(t('checkin.shiftCompletedTitle'));
        }
        fetchShift();
        setStatus('');
        return;
      }
      setStatus(`${t('checkin.fail')}: ${errorData.message || errorData.error}`);
      console.error('Network error during check-in:', err);
    }
  };

  if (!activeShift?.checkInWindow) {
    return null;
  }

  const { checkInWindow } = activeShift;
  const isLate = checkInWindow.status === 'late' || (checkInWindow.status === 'open' && timeLeft.includes('late'));

  // Display nextDue based on status
  let nextDueDisplay = new Date(checkInWindow.nextSlotStart);
  if (checkInWindow.status === 'open' || checkInWindow.status === 'early') {
    nextDueDisplay = new Date(checkInWindow.currentSlotStart);
  }

  return (
    <Card className="mb-6 shadow-sm">
      <CardContent className="pt-6">
        <div className="mb-6">
          {canCheckIn ? (
            <h2 className={`text-2xl font-bold mb-2 ${isLate ? 'text-amber-600' : 'text-green-600'}`}>
              {isLate ? t('checkin.titleLate', { defaultValue: 'Late Check-in' }) : t('checkin.titleOpen')}
            </h2>
          ) : (
            <>
              <p className="font-semibold text-gray-500">{t('checkin.titleNext')}:</p>
              <p className="text-3xl font-mono font-bold text-blue-600">
                {nextDueDisplay.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
              <p className="text-sm font-bold text-gray-400 mt-1">
                {t('checkin.graceMinutes', { minutes: activeShift.graceMinutes })}
              </p>
            </>
          )}
          <p className={`text-sm font-semibold mt-2 ${canCheckIn && !isLate ? 'text-green-600' : 'text-amber-600'}`}>
            {timeLeft}
          </p>
        </div>

        {canCheckIn && (
          <button
            onClick={handleCheckIn}
            className={`w-full text-lg font-bold py-4 rounded-lg shadow transition-all active:scale-95 text-white ${
              isLate ? 'bg-amber-600 hover:bg-amber-700' : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {isLate
              ? t('checkin.submitLateButton', { defaultValue: 'Submit Late Check-in' })
              : t('checkin.submitButton')}
          </button>
        )}

        {status && <p className="mt-4 text-center font-medium text-sm text-gray-700">{status}</p>}
      </CardContent>
    </Card>
  );
}
