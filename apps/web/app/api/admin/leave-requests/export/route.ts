import { listEmployeeLeaveRequestsForAdmin } from '@repo/database';
import { NextRequest, NextResponse } from 'next/server';
import { format } from 'date-fns';
import { adminHasPermission, getAdminAuthSession } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { resolveLeaveRequestAccessContext, buildVisibleEmployeeWhereClause } from '@/lib/auth/leave-ownership';
import { getLeaveReasonMeta } from '@/lib/leave-requests';
import {
  mergeReasonFilters,
  parseCategoriesParam,
  parseReasonsParam,
  parseSortByParam,
  parseSortOrderParam,
  parseStatusesParam,
} from '@/app/admin/(authenticated)/leave-requests/filters';

function escapeCsv(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function formatLeaveStatus(status: string) {
  switch (status) {
    case 'pending_hr':
      return 'Pending HR';
    case 'pending_manager':
      return 'Pending Manager';
    case 'pending':
      return 'Pending';
    case 'approved':
      return 'Approved';
    case 'rejected':
      return 'Rejected';
    case 'cancelled':
      return 'Cancelled';
    default:
      return status;
  }
}

function getCalendarDaysInclusive(startDate: Date, endDate: Date) {
  const start = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
  const end = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate()));
  return Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

export async function GET(request: NextRequest) {
  const session = await getAdminAuthSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!adminHasPermission(session, PERMISSIONS.LEAVE_REQUESTS.VIEW)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const searchParams = request.nextUrl.searchParams;
  const statuses = parseStatusesParam(searchParams.get('statuses') ?? undefined);
  const reasonFilters = parseReasonsParam(searchParams.get('reasons') ?? undefined);
  const categoryFilters = parseCategoriesParam(searchParams.get('categories') ?? undefined);
  const reasons = mergeReasonFilters(reasonFilters, categoryFilters);
  const sortBy = parseSortByParam(searchParams.get('sortBy') ?? undefined);
  const sortOrder = parseSortOrderParam(searchParams.get('sortOrder') ?? undefined);
  const employeeId = searchParams.get('employeeId') ?? undefined;
  const startDate = searchParams.get('startDate') ?? undefined;
  const endDate = searchParams.get('endDate') ?? undefined;

  const accessContext = await resolveLeaveRequestAccessContext(session);
  const employeeWhere = await buildVisibleEmployeeWhereClause(session, accessContext);

  const leaveRequests = await listEmployeeLeaveRequestsForAdmin({
    statuses,
    reasons,
    employeeId,
    startDate,
    endDate,
    employeeRoleFilter: accessContext.employeeRoleFilter,
    employeeWhere,
    sortBy,
    sortOrder,
  });

  const headers = [
    'Employee ID',
    'Employee Name',
    'Department',
    'Leave Type',
    'Leave Start Date',
    'Leave End Date',
    'Number of Days',
    'Leave Status',
    'Approved By',
    'Approval Date',
    'Request Notes',
    'Approval/rejection notes',
  ];

  const lines = leaveRequests.map(requestItem => {
    const reasonMeta = getLeaveReasonMeta(requestItem.reason);
    const policySnapshot = requestItem.policySnapshot as { workingDays?: unknown } | null;
    const numberOfDays =
      typeof policySnapshot?.workingDays === 'number'
        ? policySnapshot.workingDays
        : getCalendarDaysInclusive(requestItem.startDate, requestItem.endDate);
    const approvedBy = requestItem.managerApprovedBy?.name ?? requestItem.reviewedBy?.name ?? '';
    const approvalDate = requestItem.managerApprovedAt ?? requestItem.reviewedAt;

    return [
      escapeCsv(requestItem.employee.employeeNumber?.trim() || requestItem.employee.id),
      escapeCsv(requestItem.employee.fullName),
      escapeCsv(requestItem.employee.department || ''),
      escapeCsv(reasonMeta.label),
      escapeCsv(format(requestItem.startDate, 'yyyy-MM-dd')),
      escapeCsv(format(requestItem.endDate, 'yyyy-MM-dd')),
      String(numberOfDays),
      escapeCsv(formatLeaveStatus(requestItem.status)),
      escapeCsv(approvedBy),
      escapeCsv(approvalDate ? format(approvalDate, 'yyyy-MM-dd HH:mm') : ''),
      escapeCsv(requestItem.employeeNote || ''),
      escapeCsv(requestItem.adminNote || ''),
    ].join(',');
  });

  const csv = [headers.join(','), ...lines].join('\n');

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="leave_requests_export_${new Date().toISOString().split('T')[0]}.csv"`,
    },
  });
}
