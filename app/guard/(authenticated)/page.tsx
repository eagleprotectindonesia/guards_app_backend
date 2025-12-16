'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useActionState } from 'react';
import { ShiftWithRelations } from '@/app/admin/(authenticated)/shifts/components/shift-list';
import { useRouter } from 'next/navigation'; // Import useRouter
import { useGuardApi } from './hooks/use-guard-api';
import CheckInCard from '@/app/guard/components/shift/checkin-card';
import { AttendanceRecord } from '@/app/guard/components/attendance/attendance-record';
import { ShiftInfoCard } from '@/app/guard/components/shift/shift-info-card';
import { NextShiftCard } from '@/app/guard/components/shift/next-shift-card';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel';
import { PasswordChangeForm } from '@/app/guard/components/password-change/password-change-form';

// Type for password change form state
type PasswordChangeState = {
  success?: boolean;
  message?: string;
  errors?: { field: string; message: string }[];
};

// Server Action for password change
async function changeGuardPasswordAction(
  prevState: PasswordChangeState,
  formData: FormData
): Promise<PasswordChangeState> {
  const currentPassword = formData.get('currentPassword') as string;
  const newPassword = formData.get('newPassword') as string;

  if (!currentPassword || !newPassword) {
    return { message: 'Semua kolom wajib diisi.' };
  }
  if (newPassword.length < 8) {
    return {
      message: 'Kata sandi baru harus minimal 8 karakter.',
      errors: [{ field: 'newPassword', message: 'Harus minimal 8 karakter' }],
    };
  }

  const res = await fetch('/api/my/profile/change-password', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ currentPassword, newPassword }),
  });

  const data = await res.json();

  if (res.ok) {
    return { success: true, message: 'Kata sandi berhasil diperbarui!' };
  } else {
    // Attempt to parse validation errors if available
    const errors =
      data.errors?.map((err: { path: string[]; message: string }) => ({
        field: err.path[0],
        message: err.message,
      })) || [];
    return { success: false, message: data.message || 'Gagal memperbarui kata sandi.', errors };
  }
}

const parseShiftDates = (shift: any) => {
  if (!shift) return null;
  return {
    ...shift,
    startsAt: new Date(shift.startsAt),
    endsAt: new Date(shift.endsAt),
    checkInWindow: shift.checkInWindow
      ? {
          ...shift.checkInWindow,
          currentSlotStart: new Date(shift.checkInWindow.currentSlotStart),
          currentSlotEnd: new Date(shift.checkInWindow.currentSlotEnd),
          nextSlotStart: new Date(shift.checkInWindow.nextSlotStart),
        }
      : undefined,
  };
};

export default function GuardPage() {
  const router = useRouter(); // Initialize router
  const { fetchWithAuth } = useGuardApi();
  const [activeShift, setActiveShift] = useState<ShiftWithRelations | null>(null);
  const [nextShifts, setNextShifts] = useState<ShiftWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [guardDetails, setGuardDetails] = useState<{ name: string; guardCode?: string } | null>(null); // New state for guard details
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [passwordChangeState, passwordChangeFormAction] = useActionState(changeGuardPasswordAction, {});

  useEffect(() => {
    if (loading) return;

    // Update current time every second to check window validity
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now);

      // Check if the current shift has ended
      if (activeShift) {
        const endTime = new Date(activeShift.endsAt.getTime() + 5 * 60000);
        if (now > endTime) {
          setActiveShift(null);
          // Re-fetch to see if there's a new upcoming shift
          fetchShift();
        }
      } else {
        // When there's no active shift, check if we've passed the scheduled start time of the next shift
        const FIVE_MINUTES_IN_MS = 5 * 60 * 1000; // 5 minutes in milliseconds
        if (nextShifts.length > 0) {
          const startTime = new Date(nextShifts[0].startsAt);
          const shiftStartWithGrace = new Date(startTime.getTime() - FIVE_MINUTES_IN_MS);
          if (now >= shiftStartWithGrace) {
            // Fetch to see if the next shift is now the active shift
            fetchShift();
          }
        }
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [activeShift, nextShifts, loading]);

  const fetchGuardDetails = async () => {
    try {
      const res = await fetchWithAuth('/api/my/profile');
      if (res.ok) {
        const data = await res.json();
        setGuardDetails(data.guard);
      } else {
        console.error('Failed to fetch guard details');
        setGuardDetails(null);
      }
    } catch (error) {
      console.error('Network error fetching guard details:', error);
      setGuardDetails(null);
    }
  };

  const fetchShift = async () => {
    // Only set loading true if it's the first fetch or if guardDetails are already loaded
    // This prevents showing a loader when only guard details are being fetched
    setLoading(true);
    try {
      const res = await fetchWithAuth('/api/my/active-shift');
      if (!res.ok) {
        const errorData = await res.json();
        console.error('Error fetching active shift:', errorData.message || res.statusText);
        setActiveShift(null);
        setNextShifts([]);
        return;
      }
      const data = await res.json();
      if (data.activeShift) {
        setActiveShift(parseShiftDates(data.activeShift));
        // If guardDetails are not yet set, set guardName from activeShift
      } else {
        setActiveShift(null);
      }
      if (data.nextShifts && Array.isArray(data.nextShifts)) {
        setNextShifts(data.nextShifts.map(parseShiftDates));
      } else {
        setNextShifts([]);
      }
    } catch (err) {
      console.error('Network error fetching active shift:', err);
    } finally {
      setLoading(false);
    }
  };

  // useEffect(() => {
  //   const intervalId = setInterval(async () => {
  //     await Promise.all([fetchGuardDetails(), fetchShift()]);
  //   }, 2 * 60 * 1000); // 2 minutes in milliseconds

  //   return () => clearInterval(intervalId);
  // }, []);

  useEffect(() => {
    fetchGuardDetails();
    fetchShift();
  }, []);

  const handleLogout = async () => {
    try {
      const res = await fetchWithAuth('/api/auth/guard/logout', { method: 'POST' });
      if (res.ok) {
        router.push('/guard/login');
      } else {
        console.error('Logout failed');
      }
    } catch (error) {
      console.error('Network error during logout:', error);
    }
  };

  return (
    <div className="p-8 max-w-md mx-auto font-sans">
      <h1 className="text-3xl font-bold mb-1">
        Selamat datang, <br /> {guardDetails?.name || 'Guard'}!
      </h1>
      {guardDetails?.guardCode && (
        <p className="text-gray-500 text font-semibold mb-4">Kode Guard: {guardDetails.guardCode}</p>
      )}

      {loading && <p>Memuat detail Shift Anda...</p>}

      {!loading && !activeShift && (
        <div className="text-center p-8 border-2 border-dashed rounded">
          <p className="text-gray-500">Anda tidak memiliki shift aktif</p>
        </div>
      )}

      {(activeShift || nextShifts.length > 0) && (
        <>
          <div className="relative">
            <Carousel className="w-full mb-6">
              <CarouselContent>
                {activeShift && (
                  <CarouselItem>
                    <div className="p-1">
                      <ShiftInfoCard shift={activeShift} />
                    </div>
                  </CarouselItem>
                )}
                {nextShifts.map(shift => (
                  <CarouselItem key={shift.id}>
                    <div className="p-1">
                      <NextShiftCard shift={shift} />
                    </div>
                  </CarouselItem>
                ))}
              </CarouselContent>
              {(activeShift ? 1 : 0) + nextShifts.length > 1 && (
                <>
                  <CarouselPrevious className="absolute top-1/2 left-2 -translate-y-1/2 z-10 bg-transparent border-none text-blue-600 hover:text-blue-800 p-0 w-auto h-auto" />
                  <CarouselNext className="absolute top-1/2 right-2 -translate-y-1/2 z-10 bg-transparent border-none text-blue-600 hover:text-blue-800 p-0 w-auto h-auto" />
                </>
              )}
            </Carousel>
          </div>

          {activeShift && (
            <>
              <AttendanceRecord
                shift={activeShift}
                onAttendanceRecorded={fetchShift}
                status={status}
                setStatus={setStatus}
                currentTime={currentTime}
              />
              {(() => {
                const ATTENDANCE_GRACE_MINS = 5;
                const startMs = new Date(activeShift.startsAt).getTime();
                const graceEndMs = startMs + ATTENDANCE_GRACE_MINS * 60000;
                const isAttendanceLate = !activeShift.attendance && currentTime.getTime() > graceEndMs;

                return activeShift.attendance || isAttendanceLate ? (
                  <CheckInCard
                    activeShift={activeShift}
                    loading={loading}
                    status={status}
                    currentTime={currentTime}
                    setStatus={setStatus}
                    fetchShift={fetchShift}
                  />
                ) : null;
              })()}
            </>
          )}
        </>
      )}

      <div className="mt-8 border-t pt-6">
        <Button onClick={() => setShowPasswordChange(true)} variant="secondary" className="w-full mb-4">
          Ubah Kata Sandi
        </Button>

        <PasswordChangeForm
          isOpen={showPasswordChange}
          onClose={() => setShowPasswordChange(false)}
          actionState={passwordChangeState}
          formAction={passwordChangeFormAction}
        />

        <Button onClick={handleLogout} variant="destructive" className="w-full">
          Keluar
        </Button>
      </div>
    </div>
  );
}
