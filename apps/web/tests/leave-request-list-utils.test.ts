import { getLeaveRequestReviewerName } from '../app/admin/(authenticated)/leave-requests/components/leave-request-list-utils';
import { SerializedLeaveRequestAdminListItemDto } from '../types/leave-requests';

function buildLeaveRequest(
  overrides: Partial<SerializedLeaveRequestAdminListItemDto>
): SerializedLeaveRequestAdminListItemDto {
  return {
    id: overrides.id ?? 'leave-1',
    employeeId: overrides.employeeId ?? 'employee-1',
    startDate: overrides.startDate ?? '2026-04-01T00:00:00.000Z',
    endDate: overrides.endDate ?? '2026-04-03T00:00:00.000Z',
    reason: overrides.reason ?? 'annual',
    employeeNote: overrides.employeeNote ?? null,
    adminNote: overrides.adminNote ?? null,
    attachments: overrides.attachments ?? [],
    requiresDocument: overrides.requiresDocument ?? false,
    isPaid: overrides.isPaid ?? true,
    deductedAnnualDays: overrides.deductedAnnualDays ?? 0,
    unpaidDays: overrides.unpaidDays ?? 0,
    policySnapshot: overrides.policySnapshot ?? null,
    status: overrides.status ?? 'pending',
    reviewedById: overrides.reviewedById ?? null,
    reviewedAt: overrides.reviewedAt ?? null,
    managerApprovedById: overrides.managerApprovedById ?? null,
    managerApprovedAt: overrides.managerApprovedAt ?? null,
    managerApprovalNote: overrides.managerApprovalNote ?? null,
    hrApprovedById: overrides.hrApprovedById ?? null,
    hrApprovedAt: overrides.hrApprovedAt ?? null,
    hrApprovalNote: overrides.hrApprovalNote ?? null,
    documentVerifiedAt: overrides.documentVerifiedAt ?? null,
    documentVerifiedById: overrides.documentVerifiedById ?? null,
    cancelledAt: overrides.cancelledAt ?? null,
    createdAt: overrides.createdAt ?? '2026-04-01T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-04-01T00:00:00.000Z',
    employee: overrides.employee ?? {
      id: 'employee-1',
      fullName: 'Jane Doe',
      employeeNumber: 'EMP-1',
      role: 'office',
      department: 'Operations',
      officeId: 'office-1',
    },
    reviewedBy: overrides.reviewedBy ?? null,
    managerApprovedBy: overrides.managerApprovedBy ?? null,
    hrApprovedBy: overrides.hrApprovedBy ?? null,
    documentVerifiedBy: overrides.documentVerifiedBy ?? null,
  };
}

describe('getLeaveRequestReviewerName', () => {
  test('uses the manager approver for approved requests', () => {
    const reviewer = getLeaveRequestReviewerName(
      buildLeaveRequest({
        status: 'approved',
        managerApprovedBy: { id: 'admin-manager', name: 'Manager Admin', email: 'manager@example.com' },
        reviewedBy: { id: 'admin-hr', name: 'HR Admin', email: 'hr@example.com' },
      })
    );

    expect(reviewer).toBe('Manager Admin');
  });

  test('falls back to reviewedBy when manager approver is missing on approved requests', () => {
    const reviewer = getLeaveRequestReviewerName(
      buildLeaveRequest({
        status: 'approved',
        reviewedBy: { id: 'admin-manager', name: 'Manager Admin', email: 'manager@example.com' },
      })
    );

    expect(reviewer).toBe('Manager Admin');
  });

  test('uses reviewedBy for rejected requests', () => {
    const reviewer = getLeaveRequestReviewerName(
      buildLeaveRequest({
        status: 'rejected',
        reviewedBy: { id: 'admin-reviewer', name: 'Reviewer Admin', email: 'reviewer@example.com' },
      })
    );

    expect(reviewer).toBe('Reviewer Admin');
  });

  test('omits reviewer text for in-progress requests', () => {
    const reviewer = getLeaveRequestReviewerName(
      buildLeaveRequest({
        status: 'pending_manager',
        reviewedBy: { id: 'admin-reviewer', name: 'Reviewer Admin', email: 'reviewer@example.com' },
      })
    );

    expect(reviewer).toBeNull();
  });
});
