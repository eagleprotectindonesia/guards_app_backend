import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useGuardApi } from './use-guard-api';
import { ShiftWithRelations } from '@/app/admin/(authenticated)/shifts/components/shift-list';
import { CheckInWindowResult } from '@/lib/scheduling';

export type ShiftWithCheckInWindow = ShiftWithRelations & { checkInWindow?: CheckInWindowResult };

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
  const { fetchWithAuth } = useGuardApi();
  
  return useQuery({
    queryKey: ['guard', 'profile'],
    queryFn: async () => {
      const res = await fetchWithAuth('/api/my/profile');
      if (!res.ok) throw new Error('Failed to fetch profile');
      const data = await res.json();
      return data.guard as { id: string; name: string; guardCode?: string; mustChangePassword: boolean };
    },
  });
}

export function useActiveShift() {
  const { fetchWithAuth } = useGuardApi();

  return useQuery({
    queryKey: ['guard', 'active-shift'],
    queryFn: async () => {
      const res = await fetchWithAuth('/api/my/active-shift');
      if (!res.ok) throw new Error('Failed to fetch active shift');
      const data = await res.json();
      
      let activeShift = null;
      if (
        data.activeShift &&
        !(
          data.activeShift.checkInWindow?.isLastSlot &&
          ['late', 'completed'].includes(data.activeShift.checkInWindow?.status)
        )
      ) {
        activeShift = parseShiftDates(data.activeShift);
      }

      const nextShifts = (data.nextShifts || []).map(parseShiftDates);

      return { activeShift, nextShifts };
    },
    // Refetch every 2 minutes as requested in original useEffect (though it was commented out)
    // Actually, the original code had a 2 min interval commented out.
    // We can use staleTime and refetchInterval.
    refetchInterval: 2 * 60 * 1000,
  });
}

export function useLogout() {
  const { fetchWithAuth } = useGuardApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await fetchWithAuth('/api/auth/guard/logout', { method: 'POST' });
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
    mutationFn: async ({ employeeId, password }: Record<string, string>) => {
      const res = await fetch('/api/auth/guard/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ employeeId, password }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Login failed');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guard'] });
    },
  });
}

export function useCheckIn() {
  const { fetchWithAuth } = useGuardApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ shiftId, location }: { shiftId: string; location?: { lat: number; lng: number } }) => {
      const res = await fetchWithAuth(`/api/shifts/${shiftId}/checkin`, {
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
      queryClient.invalidateQueries({ queryKey: ['guard', 'active-shift'] });
    },
  });
}

export function useRecordAttendance() {
  const { fetchWithAuth } = useGuardApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ shiftId, location }: { shiftId: string; location?: { lat: number; lng: number } }) => {
      const res = await fetchWithAuth(`/api/shifts/${shiftId}/attendance`, {
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
      queryClient.invalidateQueries({ queryKey: ['guard', 'active-shift'] });
    },
  });
}

export function useChangePassword() {
  const { fetchWithAuth } = useGuardApi();

  return useMutation({
    mutationFn: async (data: Record<string, string>) => {
      const res = await fetchWithAuth('/api/my/change-password', {
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
