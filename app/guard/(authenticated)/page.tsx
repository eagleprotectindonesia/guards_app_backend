'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/app/guard/components/ui/button';
import { useActionState } from 'react';
import { ShiftWithRelations } from '@/app/admin/(authenticated)/shifts/components/shift-list';
import { useRouter } from 'next/navigation'; // Import useRouter
import { useGuardApi } from './hooks/use-guard-api';
import CheckInCard from '@/app/guard/components/shift/checkin-card';
import { AttendanceRecord } from '@/app/guard/components/attendance/attendance-record';
import { ShiftInfoCard } from '@/app/guard/components/shift/shift-info-card';

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

export default function GuardPage() {
  const router = useRouter(); // Initialize router
  const { fetchWithAuth } = useGuardApi();
  const [activeShift, setActiveShift] = useState<ShiftWithRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [guardDetails, setGuardDetails] = useState<{ name: string; guardCode?: string } | null>(null); // New state for guard details
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [passwordChangeState, passwordChangeFormAction] = useActionState(changeGuardPasswordAction, {});
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    // Update current time every second to check window validity
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now);

      // Check if the current shift has ended
      if (activeShift) {
        const endTime = new Date(activeShift.endsAt);
        if (now > endTime) {
          setActiveShift(null);
          // Optionally re-fetch to see if there's a new upcoming shift,
          // though usually there is a gap.
          // fetchShift();
        }
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [activeShift]);

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
        return;
      }
      const data = await res.json();
      if (data.activeShift) {
        setActiveShift(data.activeShift);
        // If guardDetails are not yet set, set guardName from activeShift
      } else {
        setActiveShift(null);
      }
    } catch (err) {
      console.error('Network error fetching active shift:', err);
    } finally {
      setLoading(false);
    }
  };

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
      <h1 className="text-2xl font-bold mb-1">Selamat datang, {guardDetails?.name || 'Guard'}!</h1>
      {guardDetails?.guardCode && <p className="text-gray-500 text-sm mb-4">Kode Guard: {guardDetails.guardCode}</p>}

      {loading && <p>Memuat detail Shift Anda...</p>}

      {!loading && !activeShift && (
        <div className="text-center p-8 border-2 border-dashed rounded">
          <p className="text-gray-500">Anda tidak memiliki shift aktif saat ini.</p>
        </div>
      )}

      {activeShift && (
        <>
          <ShiftInfoCard shift={activeShift} />
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

      <div className="mt-8 border-t pt-6">
        <Button onClick={() => setShowPasswordChange(true)} variant="secondary" className="w-full mb-4">
          Ubah Kata Sandi
        </Button>

        {showPasswordChange && (
          <div className="mt-4 p-4 border rounded bg-gray-50 relative">
            <button
              onClick={() => setShowPasswordChange(false)}
              className="absolute top-2 right-2 text-gray-500 hover:text-gray-700"
              aria-label="Tutup"
            >
              &times;
            </button>
            <h2 className="text-xl font-semibold mb-4">Ubah Kata Sandi</h2>
            <form action={passwordChangeFormAction} className="space-y-4">
              <div>
                <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700">
                  Kata Sandi Saat Ini
                </label>
                <input
                  type="password"
                  id="currentPassword"
                  name="currentPassword"
                  required
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
              </div>
              <div>
                <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700">
                  Kata Sandi Baru
                </label>
                <input
                  type="password"
                  id="newPassword"
                  name="newPassword"
                  required
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
                {passwordChangeState.errors?.find(e => e.field === 'newPassword') && (
                  <p className="text-red-500 text-xs mt-1">
                    {passwordChangeState.errors.find(e => e.field === 'newPassword')?.message ===
                    'Must be at least 8 characters'
                      ? 'Harus minimal 8 karakter'
                      : passwordChangeState.errors.find(e => e.field === 'newPassword')?.message}
                  </p>
                )}
              </div>
              <Button type="submit" className="w-full">
                Perbarui Kata Sandi
              </Button>
              {passwordChangeState.message && (
                <p
                  className={`mt-4 text-center text-sm ${
                    passwordChangeState.success ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {passwordChangeState.message}
                </p>
              )}
            </form>
          </div>
        )}

        <Button onClick={handleLogout} variant="destructive" className="w-full">
          Keluar
        </Button>
      </div>
    </div>
  );
}
