'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useActionState } from 'react';
import { ShiftWithRelations } from '@/app/admin/(authenticated)/shifts/components/shift-list';
import { useRouter } from 'next/navigation'; // Import useRouter
import { useGuardApi } from './hooks/use-guard-api';
import ShiftDetails from '@/components/shift/shift-details';
import { AttendanceRecord } from '@/components/attendance/attendance-record';
import { ShiftInfoCard } from '@/components/shift/shift-info-card';

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
    return { message: 'All fields are required.' };
  }
  if (newPassword.length < 8) {
    return {
      message: 'New password must be at least 8 characters long.',
      errors: [{ field: 'newPassword', message: 'Must be at least 8 characters' }],
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
    return { success: true, message: 'Password updated successfully!' };
  } else {
    // Attempt to parse validation errors if available
    const errors =
      data.errors?.map((err: { path: string[]; message: string }) => ({
        field: err.path[0],
        message: err.message,
      })) || [];
    return { success: false, message: data.message || 'Failed to update password.', errors };
  }
}

export default function GuardPage() {
  const router = useRouter(); // Initialize router
  const { fetchWithAuth } = useGuardApi();
  const [activeShift, setActiveShift] = useState<ShiftWithRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [guardDetails, setGuardDetails] = useState<{ name: string; guardCode?: string } | null>(null); // New state for guard details
  const [guardName, setGuardName] = useState('Guard');
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [passwordChangeState, passwordChangeFormAction] = useActionState(changeGuardPasswordAction, {});
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    // Update current time every second to check window validity
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchGuardDetails = async () => {
    try {
      const res = await fetchWithAuth('/api/my/profile');
      if (res.ok) {
        const data = await res.json();
        setGuardDetails(data.guard);
        setGuardName(data.guard?.name || 'Guard');
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
        if (!guardDetails) {
          setGuardName(data.activeShift.guard?.name || 'Guard');
        }
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
      <h1 className="text-2xl font-bold mb-1">Welcome, {guardName}!</h1>
      {activeShift?.guard?.guardCode && (
        <p className="text-gray-500 text-sm mb-4">Guard Code: {activeShift.guard.guardCode}</p>
      )}

      {loading && <p>Loading your shift details...</p>}

      {!loading && !activeShift && (
        <div className="text-center p-8 border-2 border-dashed rounded">
          <p className="text-gray-500">No active shift found for you at the moment.</p>
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
          />
          {activeShift.attendance && (
            <ShiftDetails
              activeShift={activeShift}
              loading={loading}
              status={status}
              currentTime={currentTime}
              setStatus={setStatus}
              fetchShift={fetchShift}
            />
          )}
        </>
      )}

      <div className="mt-8 border-t pt-6">
        <Button onClick={() => setShowPasswordChange(!showPasswordChange)} variant="secondary" className="w-full mb-4">
          {showPasswordChange ? 'Hide Password Change' : 'Change Password'}
        </Button>

        {showPasswordChange && (
          <div className="mt-4 p-4 border rounded bg-gray-50">
            <h2 className="text-xl font-semibold mb-4">Change Password</h2>
            <form action={passwordChangeFormAction} className="space-y-4">
              <div>
                <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700">
                  Current Password
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
                  New Password
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
                    {passwordChangeState.errors.find(e => e.field === 'newPassword')?.message}
                  </p>
                )}
              </div>
              <Button type="submit" className="w-full">
                Update Password
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
          Logout
        </Button>
      </div>
    </div>
  );
}
