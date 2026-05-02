import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  getEmployeeLeaveRequestByIdForAdmin,
  getEmployeeAnnualLeaveBalanceForYear,
  projectLeavePolicyOutcome,
} from '@repo/database';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { resolveLeaveRequestAccessContext } from '@/lib/auth/leave-ownership';
import { enrichLeaveRequestAttachments } from '@/lib/data-access/leave-requests';
import { serialize } from '@/lib/server-utils';
import { SerializedLeavePolicyOutcomeDto, SerializedLeaveRequestAdminListItemDto } from '@/types/leave-requests';
import LeaveRequestDetail from '../components/leave-request-detail';

export const metadata: Metadata = {
  title: 'Leave Request Detail',
};

export const dynamic = 'force-dynamic';

type LeaveRequestDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function LeaveRequestDetailPage(props: LeaveRequestDetailPageProps) {
  const session = await requirePermission(PERMISSIONS.LEAVE_REQUESTS.VIEW);
  const { id } = await props.params;

  const accessContext = await resolveLeaveRequestAccessContext(session);
  const leaveRequest = await getEmployeeLeaveRequestByIdForAdmin(id);

  if (
    !leaveRequest ||
    !accessContext.isEmployeeVisible({
      id: leaveRequest.employee.id,
      role: leaveRequest.employee.role,
      department: leaveRequest.employee.department,
      officeId: leaveRequest.employee.officeId,
    })
  ) {
    notFound();
  }

  let annualLeaveBalance: number | undefined;
  if (leaveRequest.reason === 'annual') {
    const year = new Date(leaveRequest.startDate).getFullYear();
    const balance = await getEmployeeAnnualLeaveBalanceForYear(leaveRequest.employeeId, year);
    annualLeaveBalance = balance.availableDays;
  }

  const isPending = ['pending', 'pending_hr', 'pending_manager'].includes(leaveRequest.status);
  let projectedOutcome: SerializedLeavePolicyOutcomeDto | null = null;

  if (isPending) {
    try {
      const projected = await projectLeavePolicyOutcome({
        request: {
          id: leaveRequest.id,
          startDate: leaveRequest.startDate,
          endDate: leaveRequest.endDate,
          reason: leaveRequest.reason,
          attachments: leaveRequest.attachments,
          cycleKey: leaveRequest.cycleKey,
        },
        employee: {
          id: leaveRequest.employee.id,
          role: leaveRequest.employee.role,
          gender: leaveRequest.employee.gender,
          department: leaveRequest.employee.department,
        },
      });
      projectedOutcome = serialize(projected) as SerializedLeavePolicyOutcomeDto;
    } catch (error) {
      console.error('Failed to project leave policy outcome:', error);
    }
  }

  const enriched = await enrichLeaveRequestAttachments(leaveRequest);
  const serialized = serialize(enriched) as SerializedLeaveRequestAdminListItemDto;
  const canEdit = session.isSuperAdmin || session.permissions.includes(PERMISSIONS.LEAVE_REQUESTS.EDIT);

  return (
    <div className="max-w-7xl mx-auto">
      <LeaveRequestDetail
        leaveRequest={serialized}
        canEdit={canEdit}
        annualLeaveBalance={annualLeaveBalance}
        projectedOutcome={projectedOutcome}
      />
    </div>
  );
}
