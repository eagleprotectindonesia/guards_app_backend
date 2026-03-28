import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import EmployeeScheduleManager from '../../components/employee-schedule-manager';
import {
  getAllOfficeWorkSchedules,
  getEmployeeByIdWithRelations,
  listOfficeWorkScheduleAssignments,
} from '@repo/database';

export const dynamic = 'force-dynamic';

export default async function EditEmployeePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission(PERMISSIONS.EMPLOYEES.EDIT);
  const { id } = await params;

  const [employee, schedules, assignments] = await Promise.all([
    getEmployeeByIdWithRelations(id),
    getAllOfficeWorkSchedules(),
    listOfficeWorkScheduleAssignments(id),
  ]);

  if (!employee) {
    notFound();
  }

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
      <EmployeeScheduleManager
        employeeId={employee.id}
        employeeName={employee.fullName}
        employeeCode={employee.employeeNumber}
        employeeRole={employee.role}
        timeline={timeline}
        scheduleOptions={scheduleOptions}
      />
    </div>
  );
}
