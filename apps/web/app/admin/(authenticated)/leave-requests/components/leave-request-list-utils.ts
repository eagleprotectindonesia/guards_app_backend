import { SerializedLeaveRequestAdminListItemDto } from '@/types/leave-requests';

export function getLeaveRequestReviewerName(leaveRequest: SerializedLeaveRequestAdminListItemDto) {
  if (leaveRequest.status === 'approved') {
    return leaveRequest.managerApprovedBy?.name || leaveRequest.reviewedBy?.name || '-';
  }

  if (leaveRequest.status === 'rejected') {
    return leaveRequest.reviewedBy?.name || '-';
  }

  return null;
}
