import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEmployeeApi } from './use-employee-api';
import type { ShiftWithRelationsDto } from '@/types/shifts';
import { CheckInWindowResult } from '@/lib/scheduling';
import type { OfficeAttendance, OfficeAttendanceState, EmployeeLeaveRequest, LeaveRequestReason } from '@repo/types';
import type { EmployeeAttendanceCheckinErrorPayload } from '@repo/shared';
import { useCallback, useMemo } from 'react';

export type ShiftWithCheckInWindow = ShiftWithRelationsDto & { checkInWindow?: CheckInWindowResult };
export type EmployeeShift = ShiftWithCheckInWindow;
type SerializedCheckInWindow = Omit<CheckInWindowResult, 'currentSlotStart' | 'currentSlotEnd' | 'nextSlotStart'> & {
  currentSlotStart: string | Date;
  currentSlotEnd: string | Date;
  nextSlotStart: string | Date | null;
};
type SerializedShiftWithCheckInWindow = Omit<ShiftWithRelationsDto, 'startsAt' | 'endsAt'> & {
  startsAt: string | Date;
  endsAt: string | Date;
  checkInWindow?: SerializedCheckInWindow;
};

type OfficeAttendanceScheduleContext = {
  isWorkingDay: boolean;
  isLate?: boolean;
  isAfterEnd?: boolean;
  scheduledStartStr?: string | null;
  scheduledEndStr?: string | null;
  businessDateStr?: string | null;
  schedule?: {
    id: string;
    code: string;
    name: string;
  } | null;
  businessDay?: {
    dateKey?: string;
  } | null;
};

export type EmployeeAnnouncement = {
  id: string;
  kind: 'holiday' | 'office_memo';
  title: string;
  message: string | null;
  startsAt: string;
  endsAt: string;
  createdAt: string;
  meta: Record<string, unknown>;
};

const toValidDate = (value: string | Date | null | undefined): Date | null => {
  if (value == null) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
};

export const parseShiftDates = (shift: SerializedShiftWithCheckInWindow | null): ShiftWithCheckInWindow | null => {
  if (!shift) return null;
  const startsAt = toValidDate(shift.startsAt);
  const endsAt = toValidDate(shift.endsAt);
  if (!startsAt || !endsAt) return null;

  const parsedWindow = shift.checkInWindow
    ? (() => {
        const currentSlotStart = toValidDate(shift.checkInWindow.currentSlotStart);
        const currentSlotEnd = toValidDate(shift.checkInWindow.currentSlotEnd);
        const nextSlotStart = toValidDate(shift.checkInWindow.nextSlotStart);
        if (!currentSlotStart || !currentSlotEnd || !nextSlotStart) return undefined;
        return {
          ...shift.checkInWindow,
          currentSlotStart,
          currentSlotEnd,
          nextSlotStart,
        };
      })()
    : undefined;

  return {
    ...shift,
    startsAt,
    endsAt,
    checkInWindow: parsedWindow,
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
      const data = (await res.json()) as {
        activeShift: SerializedShiftWithCheckInWindow | null;
        nextShifts?: SerializedShiftWithCheckInWindow[];
      };

      const activeShift = data.activeShift ? parseShiftDates(data.activeShift) : null;

      const nextShifts = (data.nextShifts || [])
        .map(parseShiftDates)
        .filter((shift): shift is ShiftWithCheckInWindow => !!shift);

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
        throw data as EmployeeAttendanceCheckinErrorPayload;
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
        throw data as EmployeeAttendanceCheckinErrorPayload;
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
      return data as {
        attendances: OfficeAttendance[];
        displayAttendances?: OfficeAttendance[];
        attendanceState?: OfficeAttendanceState;
        scheduleContext?: OfficeAttendanceScheduleContext;
      };
    },
  });
}

export type OfficeAttendanceHolidayPolicy = {
  entry: {
    id: string;
    title: string;
    type: 'holiday' | 'week_off' | 'emergency' | 'special_working_day';
    isPaid: boolean;
    affectsAttendance: boolean;
    notificationRequired: boolean;
    scope: 'all' | 'department';
    departmentKeys: string[];
  };
  marksAsWorkingDay: boolean;
};

export function useWeeklyOfficeAttendance() {
  const { fetchWithAuth } = useEmployeeApi();

  return useQuery({
    queryKey: ['employee', 'office-attendance', 'weekly'],
    queryFn: async () => {
      const res = await fetchWithAuth('/api/employee/my/office-attendance/weekly');
      if (!res.ok) throw new Error('Failed to fetch weekly office attendance');
      const data = await res.json();
      return data as {
        days: {
          date: string;
          dateKey: string | null;
          isWorkingDay: boolean;
          scheduledStartStr: string | null;
          scheduledEndStr: string | null;
          holidayPolicy?: OfficeAttendanceHolidayPolicy | null;
          attendances: OfficeAttendance[];
          attendanceState: OfficeAttendanceState;
        }[];
      };
    },
  });
}

export function useRecordOfficeAttendance() {
  const { fetchWithAuth } = useEmployeeApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      location,
      metadata,
      picture,
      status = 'present',
    }: {
      location?: { lat: number; lng: number };
      metadata?: Record<string, unknown>;
      picture?: string;
      status?: 'present' | 'clocked_out';
    }) => {
      const res = await fetchWithAuth('/api/employee/my/office-attendance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ location, metadata, picture, status }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw data as EmployeeAttendanceCheckinErrorPayload;
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

export function useMyLeaveRequests() {
  const { fetchWithAuth } = useEmployeeApi();

  return useQuery({
    queryKey: ['employee', 'leave-requests'],
    queryFn: async () => {
      const res = await fetchWithAuth('/api/employee/my/leave-requests');
      if (!res.ok) throw new Error('Failed to fetch leave requests');
      const data = await res.json();
      return data as {
        leaveRequests: EmployeeLeaveRequest[];
        annualLeaveBalance: {
          year: number;
          entitledDays: number;
          consumedDays: number;
          availableDays: number;
        } | null;
      };
    },
  });
}

export function useCreateLeaveRequest() {
  const { fetchWithAuth } = useEmployeeApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      startDate: string;
      endDate: string;
      reason: LeaveRequestReason;
      employeeNote?: string;
      attachments?: string[];
    }) => {
      const res = await fetchWithAuth('/api/employee/my/leave-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw error;
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee', 'leave-requests'] });
    },
  });
}

export function useCancelLeaveRequest() {
  const { fetchWithAuth } = useEmployeeApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetchWithAuth(`/api/employee/my/leave-requests/${id}/cancel`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to cancel leave request');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee', 'leave-requests'] });
    },
  });
}

export function useAnnouncements() {
  const { fetchWithAuth } = useEmployeeApi();
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();

  const userId = profile?.id;

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['employee', 'announcements'],
    queryFn: async () => {
      const res = await fetchWithAuth('/api/employee/my/announcements');
      if (!res.ok) throw new Error('Failed to fetch announcements');
      const data = await res.json();
      return data as { announcements: EmployeeAnnouncement[] };
    },
    refetchInterval: 60000,
  });

  const announcements = useMemo(() => data?.announcements ?? [], [data?.announcements]);
  const seenQueryKey = useMemo(() => ['employee', 'announcements', 'seen', userId], [userId]);

  const { data: seenIds = [] } = useQuery<string[]>({
    queryKey: seenQueryKey,
    enabled: Boolean(userId),
    queryFn: () => {
      if (typeof window === 'undefined' || !userId) return [];
      const raw = localStorage.getItem(`announcements_seen_v1:${userId}`);
      try {
        return raw ? JSON.parse(raw) : [];
      } catch {
        return [];
      }
    },
    staleTime: Infinity,
  });

  const unreadCount = useMemo(() => {
    if (announcements.length === 0) return 0;
    const seenIdSet = new Set(seenIds);
    return announcements.reduce((count, item) => count + (seenIdSet.has(item.id) ? 0 : 1), 0);
  }, [announcements, seenIds]);

  const markCurrentAsSeen = useCallback(() => {
    if (typeof window === 'undefined' || !userId || announcements.length === 0) return;

    const currentIds = announcements.map(item => item.id);
    const merged = Array.from(new Set([...seenIds, ...currentIds]));
    
    if (merged.length === seenIds.length) return;

    localStorage.setItem(`announcements_seen_v1:${userId}`, JSON.stringify(merged));
    queryClient.setQueryData(seenQueryKey, merged);
  }, [announcements, queryClient, seenIds, seenQueryKey, userId]);

  return {
    announcements,
    unreadCount,
    isLoading,
    refetch,
    isRefetching,
    markCurrentAsSeen,
  };
}
