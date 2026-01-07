'use client';

import { useEffect, useState, useRef } from 'react';
import { ShiftWithRelations } from '@/app/admin/(authenticated)/shifts/components/shift-list';
import { useGuardApi } from '@/app/guard/(authenticated)/hooks/use-guard-api';
import { CheckInWindowResult } from '@/lib/scheduling';
import { Card, CardContent } from '@/components/ui/card';
import toast from 'react-hot-toast';

type ActiveShiftWithWindow = ShiftWithRelations & {
  checkInWindow?: CheckInWindowResult;
};

type CheckInCardProps = {
  activeShift: ActiveShiftWithWindow | null;
  loading: boolean;
  status: string;
  currentTime: Date;
  setStatus: (status: string) => void;
  fetchShift: () => Promise<void>;
};

export default function CheckInCard({ activeShift, status, setStatus, fetchShift }: CheckInCardProps) {
  const { fetchWithAuth } = useGuardApi();
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [canCheckIn, setCanCheckIn] = useState(false);
  const expiryRefreshRef = useRef<string | null>(null);

  // Sync state with activeShift window data
  useEffect(() => {
    if (!activeShift?.checkInWindow) {
      return;
    }
    const formatTime = (seconds: number) => {
      if (seconds > 60) return `${Math.ceil(seconds / 60)} menit`;
      return `${seconds} detik`;
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
          message = `Check in berikutnya dalam ${formatTime(diff)}`;
        } else {
          // We might be in a drift state where frontend time > next slot but API hasn't updated.
          // In this case, we should probably fetchShift?
          // For now, just say "Opening..."
          message = 'Mempersiapkan slot berikutnya...';
        }
        isWindowOpen = false;
      } else if (window.status === 'early') {
        // Early for the very first slot (or general early)
        const diff = Math.ceil((currentSlotStartMs - now) / 1000);
        if (diff > 0) {
          message = `Check in dibuka dalam ${formatTime(diff)}`;
        } else {
          // Check if we also passed the end time (missed the window locally)
          const endDiff = Math.ceil((currentSlotEndMs - now) / 1000);
          if (endDiff > 0) {
            message = 'Check-in Buka...';
            isWindowOpen = true;
          } else {
            message = 'Jendela terlewat';
            isWindowOpen = false;
            fetchShift().catch(console.error);
          }
        }
      } else if (window.status === 'open') {
        // Open now, counting down to close
        const diff = Math.ceil((currentSlotEndMs - now) / 1000);
        if (diff > 0) {
          message = `Sisa waktu: ${formatTime(diff)}`;
          isWindowOpen = true;
        } else {
          message = 'Jendela terlewat';
          isWindowOpen = false;
          fetchShift().catch(console.error);
        }
      } else if (window.status === 'late') {
        // Late for current, waiting for next
        const diff = Math.ceil((nextSlotStartMs - now) / 1000);
        if (diff > 0) {
          message = `Check in berikutnya dalam ${formatTime(diff)}`;
        } else {
          message = 'Mempersiapkan slot berikutnya...';
        }
        isWindowOpen = false;
      }

      setTimeLeft(message);
      setCanCheckIn(isWindowOpen);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [activeShift, fetchShift]);

  const handleCheckIn = async () => {
    if (!activeShift) return;

    let locationData: { lat: number; lng: number } | undefined;

    if (navigator.geolocation) {
      setStatus('Mendapatkan lokasi...');
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
        setStatus('Lokasi diperlukan untuk melakukan check-in. Pastikan izin lokasi diaktifkan dan coba lagi.');
        return;
      }
    } else {
      setStatus('Layanan lokasi tidak tersedia di perangkat ini. Lokasi diperlukan untuk check-in.');
      return;
    }

    setStatus('Check-in...');
    try {
      const res = await fetchWithAuth(`/api/shifts/${activeShift.id}/checkin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          source: 'web-ui',
          location: locationData,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === 'Already checked in for this interval') {
          if (activeShift.checkInWindow?.isLastSlot) {
            toast.success('Shift Selesai');
          }
          fetchShift();
          return;
        }
        setStatus(`Error: ${data.message || data.error || 'Check-in gagal.'}`);
      } else {
        // setStatus(`Berhasil Check-in! Status: ${data.status}`);
        if (data.isLastSlot) {
          toast.success('Shift Selesai');
        }
        fetchShift(); // Refresh to get next window
      }
    } catch (err) {
      setStatus('Kesalahan Jaringan');
      console.error('Network error during check-in:', err);
    }
  };

  if (!activeShift?.checkInWindow) {
    return null;
  }

  const { checkInWindow } = activeShift;
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
            <h2 className="text-2xl font-bold text-green-600 mb-2">Check-in Dibuka!</h2>
          ) : (
            <>
              <p className="font-semibold text-gray-500">Check-in Berikutnya:</p>
              <p className="text-3xl font-mono font-bold text-blue-600">
                {nextDueDisplay.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
              <p className="text-sm font-bold text-gray-400 mt-1">Masa tenggang: {activeShift.graceMinutes} menit</p>
            </>
          )}
          <p className={`text-sm font-semibold mt-2 ${canCheckIn ? 'text-green-600' : 'text-amber-600'}`}>{timeLeft}</p>
        </div>

        {canCheckIn && (
          <button
            onClick={handleCheckIn}
            className="w-full text-lg font-bold py-4 rounded-lg shadow transition-all active:scale-95 bg-green-600 hover:bg-green-700 text-white"
          >
            CHECK IN SEKARANG
          </button>
        )}

        {status && <p className="mt-4 text-center font-medium text-sm text-gray-700">{status}</p>}
      </CardContent>
    </Card>
  );
}
