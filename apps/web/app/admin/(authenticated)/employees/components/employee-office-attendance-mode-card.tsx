'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { ActionState } from '@/types/actions';
import { UpdateEmployeeOfficeAttendanceModeInput } from '@repo/validations';
import { updateEmployeeOfficeAttendanceMode } from '../actions';
import Link from 'next/link';

type Props = {
  employeeId: string;
  employeeName: string;
  role: string | null;
  officeAttendanceMode: 'shift_based' | 'fixed_schedule' | null | undefined;
};

export default function EmployeeOfficeAttendanceModeCard({
  employeeId,
  employeeName,
  role,
  officeAttendanceMode,
}: Props) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState<ActionState<UpdateEmployeeOfficeAttendanceModeInput>, FormData>(
    updateEmployeeOfficeAttendanceMode.bind(null, employeeId),
    { success: false }
  );

  useEffect(() => {
    if (state.success) {
      toast.success(state.message || 'Office attendance mode updated successfully.');
      router.refresh();
    } else if (state.message && !state.success) {
      toast.error(state.message);
    }
  }, [state, router]);

  if (role !== 'office') {
    return null;
  }

  const currentMode = officeAttendanceMode ?? 'shift_based';

  return (
    <div className="bg-card rounded-xl shadow-sm border border-border p-6">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
        <div className="space-y-2">
          <div>
            <h2 className="text-xl font-bold text-foreground">Office Attendance Mode</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Switch between fixed office schedule assignments and shift-based office scheduling for {employeeName}.
            </p>
          </div>
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Changing mode clears future planning data from the other mode. Historical records are kept.
          </p>
          {currentMode === 'shift_based' && (
            <Link
              href={`/admin/office-shifts?employeeId=${employeeId}`}
              className="inline-flex items-center text-sm font-medium text-blue-600 hover:underline"
            >
              Manage this employee&apos;s office shifts
            </Link>
          )}
        </div>

        <form action={formAction} className="lg:w-96 rounded-xl border border-border bg-muted/20 p-5 space-y-4">
          <div>
            <label htmlFor="officeAttendanceMode" className="block text-sm font-medium text-foreground mb-1">
              Scheduling Mode
            </label>
            <select
              id="officeAttendanceMode"
              name="officeAttendanceMode"
              key={currentMode}
              defaultValue={currentMode}
              disabled={isPending}
              className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground"
            >
              <option value="shift_based">Shift Based</option>
              <option value="fixed_schedule">Fixed Schedule</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full px-4 py-2.5 rounded-lg bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {isPending ? 'Saving...' : 'Save Office Mode'}
          </button>
        </form>
      </div>
    </div>
  );
}
