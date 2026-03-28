import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { OfficeAttendance } from '@repo/types';
import { client } from '../api/client';
import { queryKeys } from '../api/queryKeys';
import { useAuth } from '../contexts/AuthContext';

export type MobileOfficeAttendanceScheduleContext = {
  isWorkingDay: boolean;
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

export type OfficeAttendanceTodayResponse = {
  attendances: OfficeAttendance[];
  scheduleContext?: MobileOfficeAttendanceScheduleContext;
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
    },
  });
}
