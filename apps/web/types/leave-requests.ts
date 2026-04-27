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

export type LeavePolicyCycleBreakdownDto = {
  cycleStart: string;
  cycleEnd: string;
  requestedWorkingDays: number;
  noDocAllowanceRemainingBeforeRequest: number;
  noDocPaidDaysCurrentRequest: number;
  deductedAnnualDays: number;
  unpaidDays: number;
};

export type LeavePolicySnapshotDto = {
  mainCategory?: string;
  workingDays?: number;
  calendarDays?: number;
  hasDocument?: boolean;
  annualRequestedDays?: number;
  emergencyDeductedDays?: number;
  cycleStart?: string;
  cycleEnd?: string;
  noDocPaidDays?: number;
  noDocPaidByCycle?: Record<string, number>;
  cycleBreakdown?: LeavePolicyCycleBreakdownDto[];
};

export type LeaveRequestAdminListItemDto = {
  id: string;
  employeeId: string;
  startDate: Date;
  endDate: Date;
  reason: LeaveRequestReason;
  employeeNote: string | null;
  adminNote: string | null;
  attachments: string[];
  requiresDocument: boolean;
  isPaid: boolean | null;
  deductedAnnualDays: number;
  unpaidDays: number;
  policySnapshot: LeavePolicySnapshotDto | null;
  status: LeaveRequestStatus;
  reviewedById: string | null;
  reviewedAt: Date | null;
  documentVerifiedAt: Date | null;
  documentVerifiedById: string | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  employee: LeaveRequestEmployeeSummaryDto;
  reviewedBy: LeaveRequestReviewedByDto;
  documentVerifiedBy: LeaveRequestReviewedByDto;
};

export type SerializedLeaveRequestAdminListItemDto = Serialized<LeaveRequestAdminListItemDto>;
