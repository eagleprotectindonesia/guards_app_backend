'use client';

import { useEffect, useState } from 'react';
import type { ShiftWithRelationsDto } from '@/types/shifts';
import { useCheckIn } from '@/app/employee/(authenticated)/hooks/use-employee-queries';
import { CheckInWindowResult } from '@/lib/scheduling';
import { Card } from '@/components/ui/card';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { Clock, CheckCircle, AlertTriangle, Fingerprint, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

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
  const [timerDisplay, setTimerDisplay] = useState<string>('--');
  const [timerLabel, setTimerLabel] = useState<string>('');
  const [canCheckIn, setCanCheckIn] = useState(false);
  const [uiState, setUiState] = useState<'upcoming' | 'open' | 'urgent' | 'late'>('upcoming');

  useEffect(() => {
    if (!activeShift?.checkInWindow) return;

    const formatTime = (seconds: number) => {
      const absSeconds = Math.abs(seconds);
      if (absSeconds > 60) {
        const mins = Math.ceil(absSeconds / 60);
        return { value: mins.toString(), label: t('common.minutes') };
      }
      return { value: absSeconds.toString(), label: t('common.seconds') };
    };

    const updateTimer = () => {
      const window = activeShift.checkInWindow;
      if (!window) return;

      const now = Date.now();
      const currentSlotStart = new Date(window.currentSlotStart).getTime();
      const currentSlotEnd = new Date(window.currentSlotEnd).getTime();
      const nextSlotStart = new Date(window.nextSlotStart || window.currentSlotStart).getTime();

      let newState: 'upcoming' | 'open' | 'urgent' | 'late' = 'upcoming';
      let displayValue = '--';
      let displayLabel = '';
      let isWindowOpen = false;

      if (window.status === 'completed') {
        const diff = Math.ceil((nextSlotStart - now) / 1000);
        if (diff > 0) {
          newState = 'upcoming';
          const ft = formatTime(diff);
          displayValue = ft.value;
          displayLabel = ft.label;
        } else {
          displayValue = '...';
          displayLabel = t('checkin.preparingNext');
          fetchShift();
        }
      } else if (window.status === 'early') {
        const diff = Math.ceil((currentSlotStart - now) / 1000);
        if (diff > 0) {
          newState = 'upcoming';
          const ft = formatTime(diff);
          displayValue = ft.value;
          displayLabel = ft.label;
        } else {
          if (now < currentSlotEnd) {
            newState = 'open';
            isWindowOpen = true;
          } else {
            newState = 'late';
            isWindowOpen = true;
            fetchShift();
          }
        }
      } else if (window.status === 'open') {
        const diff = Math.ceil((currentSlotEnd - now) / 1000);
        if (diff > 0) {
          const ft = formatTime(diff);
          displayValue = ft.value;
          displayLabel = ft.label;
          isWindowOpen = true;
          if (diff < 60) {
            newState = 'urgent';
          } else {
            newState = 'open';
          }
        } else {
          newState = 'late';
          isWindowOpen = true;
          fetchShift();
        }
      } else if (window.status === 'late') {
        newState = 'late';
        isWindowOpen = true;
        displayValue = '!';
        displayLabel = t('checkin.missed');
      }

      setUiState(newState);
      setTimerDisplay(displayValue);
      setTimerLabel(displayLabel);
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
    }
  };

  if (!activeShift?.checkInWindow) return null;

  const getUIConfig = () => {
    switch (uiState) {
      case 'upcoming':
        return {
          bgGradient: 'from-neutral-900 to-neutral-900',
          glowColor: 'bg-blue-500',
          glowShadow: 'shadow-[0_0_20px_rgba(59,130,246,0.6)]',
          icon: <Clock className="w-6 h-6 text-blue-500" />,
          title: t('checkin.titleNext'),
          subtitle: t('checkin.opensIn', { time: '' }).replace('{{time}}', ''),
          textColor: 'text-blue-400',
          btnGradient: 'from-blue-500 to-blue-700',
          showBtn: false,
        };
      case 'open':
        return {
          bgGradient: 'from-green-900/20 to-neutral-900',
          glowColor: 'bg-green-500',
          glowShadow: 'shadow-[0_0_20px_rgba(34,197,94,0.6)]',
          icon: <CheckCircle className="w-6 h-6 text-green-500" />,
          title: t('checkin.titleOpen'),
          subtitle: t('checkin.windowClosing'),
          textColor: 'text-green-400',
          btnGradient: 'from-green-500 to-green-700',
          showBtn: true,
        };
      case 'urgent':
        return {
          bgGradient: 'from-amber-900/30 to-neutral-900',
          glowColor: 'bg-amber-500',
          glowShadow: 'shadow-[0_0_20px_rgba(245,158,11,0.6)]',
          icon: <AlertTriangle className="w-6 h-6 text-amber-500" />,
          title: t('checkin.checkpointTitle'),
          subtitle: t('checkin.windowClosing'),
          textColor: 'text-amber-400',
          btnGradient: 'from-amber-500 to-amber-700',
          showBtn: true,
        };
      case 'late':
        return {
          bgGradient: 'from-red-900/30 to-neutral-900',
          glowColor: 'bg-red-500',
          glowShadow: 'shadow-[0_0_20px_rgba(239,68,68,0.6)]',
          icon: <AlertTriangle className="w-6 h-6 text-red-500" />,
          title: t('checkin.titleLate'),
          subtitle: t('checkin.lateStatus'),
          textColor: 'text-red-400',
          btnGradient: 'from-red-600 to-red-800',
          showBtn: true,
        };
    }
  };

  const ui = getUIConfig();

  return (
    <Card className={`mb-6 shadow-2xl bg-neutral-950 border border-neutral-800 relative overflow-hidden rounded-3xl`}>
      {/* Background Gradient Mesh */}
      <div className={cn('absolute inset-0 bg-linear-to-b opacity-50', ui.bgGradient)} />

      <div className="relative z-10 flex flex-col">
        {/* Header */}
        <div className="p-6 pb-2 flex flex-col items-center border-b border-white/5 relative">
          {/* Top Glow Pill */}
          <div className={cn('w-32 h-1 rounded-full mb-6 opacity-60', ui.glowColor, ui.glowShadow)} />

          <div className="w-12 h-12 bg-neutral-900 rounded-full flex items-center justify-center mb-3 border border-white/5 shadow-lg">
            {ui.icon}
          </div>

          <h2 className="text-white font-bold text-lg mb-1">{ui.title}</h2>
          <p className="text-neutral-400 text-xs font-medium uppercase tracking-wider">{ui.subtitle}</p>
        </div>

        {/* Content */}
        <div className="p-6 pt-8 flex flex-col items-center">
          {uiState !== 'late' && (
            <div className="flex flex-col items-center mb-8">
              <span className="text-white text-6xl font-light tracking-tighter leading-none">{timerDisplay}</span>
              <span className="text-neutral-500 text-xs font-bold uppercase tracking-[0.2em] mt-2">{timerLabel}</span>
            </div>
          )}

          {ui.showBtn && (
            <button
              onClick={canCheckIn ? handleCheckIn : undefined}
              disabled={!canCheckIn || checkInMutation.isPending}
              className={cn(
                'w-full py-4 rounded-xl flex items-center justify-center gap-2 text-white font-bold uppercase tracking-widest text-sm shadow-lg transition-all active:scale-95 bg-linear-to-br',
                ui.btnGradient,
                (!canCheckIn || checkInMutation.isPending) && 'opacity-50 cursor-not-allowed'
              )}
            >
              {checkInMutation.isPending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Fingerprint className="w-5 h-5" />
              )}
              {uiState === 'late' ? t('checkin.submitLateButton') : t('checkin.checkInNow')}
            </button>
          )}

          {status && <p className="mt-4 text-neutral-400 text-xs text-center">{status}</p>}
        </div>
      </div>
    </Card>
  );
}
