import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import EmployeeScheduleManager from '../../components/employee-schedule-manager';
import EmployeeFieldModeCard from '../../components/employee-field-mode-card';
import EmployeeLeaveBalanceCard from '../../components/employee-leave-balance-card';
import { resolveLeaveRequestAccessContext } from '@/lib/auth/leave-ownership';
import { isOfficeWorkSchedulesEnabled } from '@/lib/feature-flags';
import {
  getEmployeeAnnualLeaveBalanceWithLedger,
  getAllOfficeWorkSchedules,
  getEmployeeByIdWithRelations,
  listOfficeWorkScheduleAssignments,
} from '@repo/database';
import { serialize } from '@/lib/server-utils';

export const dynamic = 'force-dynamic';

export default async function EditEmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission(PERMISSIONS.EMPLOYEES.EDIT);
  const { id } = await params;
  const officeWorkSchedulesEnabled = isOfficeWorkSchedulesEnabled();
  const canViewLeaveBalance = session.isSuperAdmin || session.permissions.includes(PERMISSIONS.LEAVE_REQUESTS.VIEW);
  const leaveBalanceYear = new Date().getFullYear();

  const [employee, officeWorkScheduleData] = await Promise.all([
    getEmployeeByIdWithRelations(id),
    officeWorkSchedulesEnabled
      ? Promise.all([getAllOfficeWorkSchedules(), listOfficeWorkScheduleAssignments(id)])
      : Promise.resolve([[], []] as const),
  ]);

  if (!employee) {
    notFound();
  }
  const leaveAccessContext = canViewLeaveBalance ? await resolveLeaveRequestAccessContext(session) : null;
  const canViewEmployeeLeaveBalance =
    canViewLeaveBalance &&
    !!leaveAccessContext?.isEmployeeVisible({
      id: employee.id,
      role: employee.role,
      department: employee.department,
      officeId: employee.officeId,
    });
  const leaveBalanceData = canViewEmployeeLeaveBalance
    ? await getEmployeeAnnualLeaveBalanceWithLedger({
        employeeId: id,
        year: leaveBalanceYear,
        ledgerTake: 10,
      })
    : null;

  const [schedules, assignments] = officeWorkScheduleData;
  const now = new Date();
  const scheduleOptions = schedules.map(schedule => ({
    id: schedule.id,
    name: schedule.name,
  }));
  const timeline = assignments
    .slice()
    .reverse()
    .map(assignment => {
      const startsAt = new Date(assignment.effectiveFrom);
      const endsAt = assignment.effectiveUntil ? new Date(assignment.effectiveUntil) : null;
      const status =
        startsAt > now ? 'Upcoming' : endsAt && endsAt <= now ? 'Past' : 'Current';

      return {
        id: assignment.id,
        scheduleId: assignment.officeWorkSchedule.id,
        scheduleName: assignment.officeWorkSchedule.name,
        effectiveFrom: assignment.effectiveFrom.toISOString(),
        effectiveUntil: assignment.effectiveUntil ? assignment.effectiveUntil.toISOString() : null,
        status: status as 'Past' | 'Current' | 'Upcoming',
      };
    });

  return (
    <div className="max-w-6xl mx-auto py-8 space-y-8">
      <EmployeeFieldModeCard
        employeeId={employee.id}
        employeeName={employee.fullName}
        role={employee.role ?? null}
        officeName={employee.office?.name ?? null}
        jobTitle={employee.jobTitle ?? null}
        jobTitleCategory={employee.jobTitleCategory}
        fieldModeEnabled={employee.fieldModeEnabled}
        isFieldModeEditable={employee.isFieldModeEditable}
        fieldModeReasonCode={employee.fieldModeReasonCode}
      />
      {leaveBalanceData ? (
        <EmployeeLeaveBalanceCard
          employeeId={employee.id}
          employeeName={employee.fullName}
          year={leaveBalanceYear}
          balance={serialize(leaveBalanceData.balance)}
          ledger={serialize(leaveBalanceData.ledger)}
        />
      ) : null}
      {employee.role === 'office' && officeWorkSchedulesEnabled ? (
        <EmployeeScheduleManager
          employeeId={employee.id}
          employeeName={employee.fullName}
          employeeCode={employee.employeeNumber}
          employeeRole={employee.role}
          timeline={timeline}
          scheduleOptions={scheduleOptions}
        />
      ) : null}
      {employee.role === 'office' ? (
        <div className="bg-card rounded-xl shadow-sm border border-border p-6">
          <h2 className="text-xl font-bold text-foreground">Office Shifts</h2>
          <p className="text-sm text-muted-foreground mt-2">
            Manage office shifts and day-specific availability for this employee.
          </p>
          <a
            href={`/admin/office-shifts?employeeId=${employee.id}`}
            className="inline-flex items-center mt-4 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
          >
            Open Office Shifts
          </a>
        </div>
      ) : null}
    </div>
  );
}
