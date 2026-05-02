import type { EmployeeRole, LeaveRequestReason, LeaveRequestStatus } from '@repo/types';
import type { LeavePolicyOutcomeProjection, LeavePolicySnapshot } from '@repo/database';
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

export type LeavePolicySnapshotDto = LeavePolicySnapshot;

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
  managerApprovedById: string | null;
  managerApprovedAt: Date | null;
  managerApprovalNote: string | null;
  hrApprovedById: string | null;
  hrApprovedAt: Date | null;
  hrApprovalNote: string | null;
  documentVerifiedAt: Date | null;
  documentVerifiedById: string | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  employee: LeaveRequestEmployeeSummaryDto;
  reviewedBy: LeaveRequestReviewedByDto;
  managerApprovedBy: LeaveRequestReviewedByDto;
  hrApprovedBy: LeaveRequestReviewedByDto;
  documentVerifiedBy: LeaveRequestReviewedByDto;
};

export type LeavePolicyOutcomeDto = {
  isPaid: LeavePolicyOutcomeProjection['isPaid'];
  deductedAnnualDays: LeavePolicyOutcomeProjection['deductedAnnualDays'];
  unpaidDays: LeavePolicyOutcomeProjection['unpaidDays'];
  policySnapshot: LeavePolicyOutcomeProjection['policySnapshot'];
};

export type SerializedLeaveRequestAdminListItemDto = Serialized<LeaveRequestAdminListItemDto>;
export type SerializedLeavePolicyOutcomeDto = Serialized<LeavePolicyOutcomeDto>;
