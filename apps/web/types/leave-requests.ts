import type { EmployeeRole, LeaveRequestReason, LeaveRequestStatus } from '@repo/types';
import type { Serialized } from '@/lib/server-utils';

export type LeaveRequestEmployeeSummaryDto = {
  id: string;
  fullName: string;
  employeeNumber: string | null;
  role: EmployeeRole;
  department: string | null;
  officeId: string | null;
};

export type LeaveRequestReviewedByDto = {
  id: string;
  name: string;
  email: string;
} | null;

export type LeaveRequestAdminListItemDto = {
  id: string;
  employeeId: string;
  startDate: Date;
  endDate: Date;
  reason: LeaveRequestReason;
  employeeNote: string | null;
  adminNote: string | null;
  attachments: string[];
  status: LeaveRequestStatus;
  reviewedById: string | null;
  reviewedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  employee: LeaveRequestEmployeeSummaryDto;
  reviewedBy: LeaveRequestReviewedByDto;
};

export type SerializedLeaveRequestAdminListItemDto = Serialized<LeaveRequestAdminListItemDto>;

