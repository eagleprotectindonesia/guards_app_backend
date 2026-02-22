import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEmployeeApi } from './use-employee-api';
import type { ShiftWithRelationsDto } from '@/types/shifts';
import { CheckInWindowResult } from '@/lib/scheduling';
import { OfficeAttendance } from '@repo/types';

export type ShiftWithCheckInWindow = ShiftWithRelationsDto & { checkInWindow?: CheckInWindowResult };

const parseShiftDates = (shift: ShiftWithCheckInWindow) => {
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

export function useProfile() {
  const { fetchWithAuth } = useEmployeeApi();

  return useQuery({
    queryKey: ['employee', 'profile'],
    queryFn: async () => {
      const res = await fetchWithAuth('/api/employee/my/profile');
      if (!res.ok) throw new Error('Failed to fetch profile');
      const data = await res.json();
      return (data.employee || data.guard) as {
        id: string;
        fullName: string;
        employeeNumber?: string;
        mustChangePassword: boolean;
        role?: 'on_site' | 'office';
        officeId?: string;
        office?: { id: string; name: string; latitude?: number; longitude?: number };
        department?: string;
        jobTitle?: string;
      };
    },
  });
}

export function useActiveShift() {
  const { fetchWithAuth } = useEmployeeApi();

  return useQuery({
    queryKey: ['employee', 'active-shift'],
    queryFn: async () => {
      const res = await fetchWithAuth('/api/employee/my/active-shift');
      if (!res.ok) throw new Error('Failed to fetch active shift');
      const data = await res.json();

      const activeShift = data.activeShift ? parseShiftDates(data.activeShift) : null;

      const nextShifts = (data.nextShifts || []).map(parseShiftDates);

      return { activeShift, nextShifts };
    },
    // Refetch every 2 minutes
    refetchInterval: 2 * 60 * 1000,
  });
}

export function useLogout() {
  const { fetchWithAuth } = useEmployeeApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await fetchWithAuth('/api/employee/auth/logout', { method: 'POST' });
      if (!res.ok) throw new Error('Logout failed');
      return res.json();
    },
    onSuccess: () => {
      queryClient.clear();
    },
  });
}

export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ employeeNumber, password }: Record<string, string>) => {
      const res = await fetch('/api/employee/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ employeeNumber, password }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Login failed');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee'] });
    },
  });
}

export function useCheckIn() {
  const { fetchWithAuth } = useEmployeeApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ shiftId, location }: { shiftId: string; location?: { lat: number; lng: number } }) => {
      const res = await fetchWithAuth(`/api/employee/shifts/${shiftId}/checkin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          source: 'web-ui',
          location,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw data;
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee', 'active-shift'] });
    },
  });
}

export function useRecordAttendance() {
  const { fetchWithAuth } = useEmployeeApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ shiftId, location }: { shiftId: string; location?: { lat: number; lng: number } }) => {
      const res = await fetchWithAuth(`/api/employee/shifts/${shiftId}/attendance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ shiftId, location }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.message || 'Gagal merekam kehadiran');
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee', 'active-shift'] });
    },
  });
}

export function useOfficeAttendance() {
  const { fetchWithAuth } = useEmployeeApi();

  return useQuery({
    queryKey: ['employee', 'office-attendance', 'today'],
    queryFn: async () => {
      const res = await fetchWithAuth('/api/employee/my/office-attendance/today');
      if (!res.ok) throw new Error('Failed to fetch today office attendance');
      const data = await res.json();
      return data.attendances as OfficeAttendance[];
    },
  });
}

export function useRecordOfficeAttendance() {
  const { fetchWithAuth } = useEmployeeApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      officeId,
      location,
      status = 'present',
    }: {
      officeId: string;
      location?: { lat: number; lng: number };
      status?: 'present' | 'clocked_out';
    }) => {
      const res = await fetchWithAuth('/api/employee/my/office-attendance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ officeId, location, status }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.message || 'Gagal merekam kehadiran kantor');
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee', 'office-attendance'] });
    },
  });
}

export function useChangePassword() {
  const { fetchWithAuth } = useEmployeeApi();

  return useMutation({
    mutationFn: async (data: Record<string, string>) => {
      const res = await fetchWithAuth('/api/employee/my/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const result = await res.json();
      if (!res.ok) {
        throw result;
      }
      return result;
    },
  });
}
