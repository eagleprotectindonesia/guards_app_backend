import { useQuery } from '@tanstack/react-query';
import { client } from '../api/client';
import { queryKeys } from '../api/queryKeys';
import { useAuth } from '../contexts/AuthContext';
import { ShiftWithRelations, CheckInWindowResult } from '@repo/types';

export type ActiveShiftData = {
  activeShift: (ShiftWithRelations & { checkInWindow?: CheckInWindowResult }) | null;
  nextShifts: ShiftWithRelations[];
};

export function useActiveShift() {
  const { user, isAuthenticated } = useAuth();
  const isOnSiteEmployee = user?.role === 'on_site';

  const { data, isLoading } = useQuery<ActiveShiftData>({
    queryKey: queryKeys.shifts.active,
    enabled: isAuthenticated && isOnSiteEmployee,
    queryFn: async () => {
      const res = await client.get('/api/employee/my/active-shift');
      return res.data;
    },
    refetchInterval: 30000,
  });

  const activeShift = data?.activeShift ?? null;
  return {
    activeShift,
    activeShiftId: activeShift?.id ?? null,
    isOnActiveShift: activeShift !== null,
    isLoading,
  };
}
