import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { OfficeAttendance, OfficeAttendanceState } from '@repo/types';
import { client } from '../api/client';
import { queryKeys } from '../api/queryKeys';
import { useAuth } from '../contexts/AuthContext';

export type MobileOfficeAttendanceHolidayPolicy = {
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

export type MobileOfficeAttendanceScheduleContext = {
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
  holidayPolicy?: MobileOfficeAttendanceHolidayPolicy | null;
};

export type OfficeAttendanceTodayResponse = {
  attendances: OfficeAttendance[];
  attendanceState?: OfficeAttendanceState;
  scheduleContext?: MobileOfficeAttendanceScheduleContext;
};

export type OfficeAttendanceDaySummary = {
  date: string;
  dateKey: string | null;
  isWorkingDay: boolean;
  scheduledStartStr: string | null;
  scheduledEndStr: string | null;
  holidayPolicy?: MobileOfficeAttendanceHolidayPolicy | null;
  attendances: OfficeAttendance[];
  attendanceState: OfficeAttendanceState;
};

export type WeeklyOfficeAttendanceResponse = {
  days: OfficeAttendanceDaySummary[];
};

export function useOfficeAttendance(enabled = true) {
  const { isAuthenticated } = useAuth();

  return useQuery<OfficeAttendanceTodayResponse>({
    queryKey: queryKeys.officeAttendance.today,
    enabled: isAuthenticated && enabled,
    queryFn: async () => {
      const response = await client.get('/api/employee/my/office-attendance/today');
      return response.data;
    },
    refetchInterval: 30000,
  });
}

export function useWeeklyOfficeAttendance(enabled = true) {
  const { isAuthenticated } = useAuth();

  return useQuery<WeeklyOfficeAttendanceResponse>({
    queryKey: queryKeys.officeAttendance.weekly,
    enabled: isAuthenticated && enabled,
    queryFn: async () => {
      const response = await client.get('/api/employee/my/office-attendance/weekly');
      return response.data;
    },
    refetchInterval: 60000,
  });
}

export function useRecordOfficeAttendance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      location,
      status = 'present',
    }: {
      location?: { lat: number; lng: number };
      status?: 'present' | 'clocked_out';
    }) => {
      const response = await client.post('/api/employee/my/office-attendance', {
        location,
        status,
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.officeAttendance.today });
      queryClient.invalidateQueries({ queryKey: queryKeys.officeAttendance.weekly });
    },
  });
}
