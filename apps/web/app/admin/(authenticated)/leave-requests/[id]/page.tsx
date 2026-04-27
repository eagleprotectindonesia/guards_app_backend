import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getEmployeeLeaveRequestByIdForAdmin } from '@repo/database';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { resolveLeaveRequestAccessContext } from '@/lib/auth/leave-ownership';
import { enrichLeaveRequestAttachments } from '@/lib/data-access/leave-requests';
import { serialize } from '@/lib/server-utils';
import { SerializedLeaveRequestAdminListItemDto } from '@/types/leave-requests';
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

  const enriched = await enrichLeaveRequestAttachments(leaveRequest);
  const serialized = serialize(enriched) as SerializedLeaveRequestAdminListItemDto;
  const canEdit = session.isSuperAdmin || session.permissions.includes(PERMISSIONS.LEAVE_REQUESTS.EDIT);

  return (
    <div className="max-w-7xl mx-auto">
      <LeaveRequestDetail leaveRequest={serialized} canEdit={canEdit} />
    </div>
  );
}

