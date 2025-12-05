'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useActionState } from 'react';
import { ShiftWithRelations } from '@/app/admin/(authenticated)/shifts/components/shift-list';

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
  const [activeShift, setActiveShift] = useState<ShiftWithRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [nextDue, setNextDue] = useState<Date | null>(null);
  const [guardName, setGuardName] = useState('Guard');
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [passwordChangeState, passwordChangeFormAction] = useActionState(changeGuardPasswordAction, {});

  const fetchShift = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/my/active-shift');
      if (!res.ok) {
        const errorData = await res.json();
        console.error('Error fetching active shift:', errorData.message || res.statusText);
        setActiveShift(null);
        return;
      }
      const data = await res.json();
      if (data.activeShift) {
        setActiveShift(data.activeShift);
        setGuardName(data.activeShift.guard?.name || 'Guard');

        const last = data.activeShift.lastHeartbeatAt || data.activeShift.startsAt;
        const interval = data.activeShift.requiredCheckinIntervalMins * 60000;
        setNextDue(new Date(new Date(last).getTime() + interval));
      } else {
        setActiveShift(null);
        setGuardName('Guard');
      }
    } catch (err) {
      console.error('Network error fetching active shift:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShift();
  }, []);

  const handleCheckIn = async () => {
    if (!activeShift) return;
    setStatus('Checking in...');
    try {
      const res = await fetch(`/api/shifts/${activeShift.id}/checkin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ source: 'web-ui' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(`Error: ${data.message || 'Check-in failed.'}`);
      } else {
        setStatus(`Checked in! Status: ${data.status}`);
        setNextDue(new Date(data.next_due_at));
        fetchShift();
      }
    } catch (err) {
      setStatus('Network Error');
      console.error('Network error during check-in:', err);
    }
  };

  return (
    <div className="p-8 max-w-md mx-auto font-sans">
      <h1 className="text-2xl font-bold mb-4">Welcome, {guardName}!</h1>

      {loading && <p>Loading your shift details...</p>}

      {!loading && !activeShift && (
        <div className="text-center p-8 border-2 border-dashed rounded">
          <p className="text-gray-500">No active shift found for you at the moment.</p>
        </div>
      )}

      {activeShift && (
        <div className="border rounded-lg shadow-sm p-6 bg-white mb-6">
          <div className="mb-4">
            <h2 className="text-xl font-semibold">{activeShift.shiftType.name}</h2>
            <p className="text-gray-600">{activeShift.site.name}</p>
          </div>

          <div className="mb-6">
            <p className="text-sm text-gray-500">Next Check-in Due:</p>
            <p className="text-3xl font-mono font-bold text-blue-600">
              {nextDue ? nextDue.toLocaleTimeString() : '--:--'}
            </p>
            <p className="text-xs text-gray-400 mt-1">Grace period: {activeShift.graceMinutes} min</p>
          </div>

          <button
            onClick={handleCheckIn}
            className="w-full bg-green-600 hover:bg-green-700 text-white text-lg font-bold py-4 rounded-lg shadow transition-all active:scale-95"
          >
            CHECK IN NOW
          </button>

          {status && <p className="mt-4 text-center font-medium">{status}</p>}
        </div>
      )}

      <div className="mt-8 border-t pt-6">
        <Button onClick={() => setShowPasswordChange(!showPasswordChange)} variant="secondary" className="w-full">
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
      </div>
    </div>
  );
}
