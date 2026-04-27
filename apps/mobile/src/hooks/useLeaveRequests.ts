import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { client } from '../api/client';
import { EmployeeLeaveRequest, LeaveRequestReason } from '@repo/types';
import { queryKeys } from '../api/queryKeys';

export type AnnualLeaveBalanceSummary = {
  year: number;
  entitledDays: number;
  adjustedDays: number;
  consumedDays: number;
  availableDays: number;
};

type LeaveRequestsResponse = {
  leaveRequests: EmployeeLeaveRequest[];
  annualLeaveBalance?: AnnualLeaveBalanceSummary;
};

export function useMyLeaveRequests() {
  return useQuery<LeaveRequestsResponse>({
    queryKey: queryKeys.leaveRequests.list,
    queryFn: async () => {
      const res = await client.get('/api/employee/my/leave-requests');
      return res.data as LeaveRequestsResponse;
    },
  });
}

export function useCreateLeaveRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      startDate: string;
      endDate: string;
      reason: LeaveRequestReason;
      employeeNote?: string;
      attachments?: string[];
    }) => {
      const res = await client.post('/api/employee/my/leave-requests', data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.leaveRequests.list });
    },
  });
}

export function useCancelLeaveRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await client.post(`/api/employee/my/leave-requests/${id}/cancel`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.leaveRequests.list });
    },
  });
}
