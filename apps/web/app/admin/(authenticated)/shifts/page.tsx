import { prisma } from '@/lib/prisma';
import { getPaginationParams } from '@/lib/utils';
import ShiftList from './components/shift-list';
import { parseISO, startOfDay, endOfDay, format } from 'date-fns';
import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getActiveSites } from '@/lib/data-access/sites';
import { getActiveEmployeesSummary } from '@/lib/data-access/employees';
import { getPaginatedShifts } from '@/lib/data-access/shifts';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import type { SerializedShiftWithRelationsDto } from '@/types/shifts';
import { EmployeeSummary } from '@repo/database';

export const metadata: Metadata = {
  title: 'Shifts Management',
};

export const dynamic = 'force-dynamic';

export default async function ShiftsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requirePermission(PERMISSIONS.SHIFTS.VIEW);
  const resolvedSearchParams = await searchParams;
  const { page, perPage, skip } = getPaginationParams(resolvedSearchParams);

  // Default startDate to today if not provided
  const startDate =
    typeof resolvedSearchParams.startDate === 'string'
      ? resolvedSearchParams.startDate
      : format(new Date(), 'yyyy-MM-dd');
  const endDate = typeof resolvedSearchParams.endDate === 'string' ? resolvedSearchParams.endDate : undefined;
  const employeeId = typeof resolvedSearchParams.employeeId === 'string' ? resolvedSearchParams.employeeId : undefined;
  const siteId = typeof resolvedSearchParams.siteId === 'string' ? resolvedSearchParams.siteId : undefined;
  const sort =
    typeof resolvedSearchParams.sort === 'string' && ['asc', 'desc'].includes(resolvedSearchParams.sort)
      ? resolvedSearchParams.sort
      : 'desc';

  const parsedStartDate = startDate ? startOfDay(parseISO(startDate)) : undefined;
  const parsedEndDate = endDate ? endOfDay(parseISO(endDate)) : undefined;

  const where = {
    startsAt: {
      gte: parsedStartDate,
      lte: parsedEndDate,
    },
    employeeId: employeeId || undefined,
    siteId: siteId || undefined,
  };

  const { shifts, totalCount } = await getPaginatedShifts({
    where,
    orderBy: { startsAt: sort as 'asc' | 'desc' },
    skip,
    take: perPage,
    include: {
      site: true,
      shiftType: true,
      employee: true,
      attendance: true,
      createdBy: { select: { name: true } },
      lastUpdatedBy: { select: { name: true } },
    },
  });

  const sites = await getActiveSites();
  const shiftTypes = await prisma.shiftType.findMany({ orderBy: { name: 'asc' } });
  const employees = await getActiveEmployeesSummary('on_site');

  const shiftDtos: SerializedShiftWithRelationsDto[] = shifts.map(shift => ({
    id: shift.id,
    siteId: shift.siteId,
    shiftTypeId: shift.shiftTypeId,
    employeeId: shift.employeeId,
    date: shift.date.toISOString(),
    startsAt: shift.startsAt.toISOString(),
    endsAt: shift.endsAt.toISOString(),
    status: shift.status,
    checkInStatus: shift.checkInStatus,
    requiredCheckinIntervalMins: shift.requiredCheckinIntervalMins,
    graceMinutes: shift.graceMinutes,
    lastHeartbeatAt: shift.lastHeartbeatAt ? shift.lastHeartbeatAt.toISOString() : null,
    missedCount: shift.missedCount,
    note: shift.note,
    createdAt: shift.createdAt.toISOString(),
    updatedAt: shift.updatedAt.toISOString(),
    site: {
      id: shift.site.id,
      name: shift.site.name,
      clientName: shift.site.clientName,
      address: shift.site.address,
      latitude: shift.site.latitude,
      longitude: shift.site.longitude,
      status: shift.site.status,
      note: shift.site.note,
    },
    shiftType: {
      id: shift.shiftType.id,
      name: shift.shiftType.name,
      startTime: shift.shiftType.startTime,
      endTime: shift.shiftType.endTime,
    },
    employee: shift.employee
      ? {
          id: shift.employee.id,
          firstName: shift.employee.firstName,
          lastName: shift.employee.lastName,
          fullName:
            shift.employee.fullName ?? [shift.employee.firstName, shift.employee.lastName].filter(Boolean).join(' '),
          employeeCode: shift.employee.employeeCode,
        }
      : null,
    attendance: shift.attendance
      ? {
          id: shift.attendance.id,
          shiftId: shift.attendance.shiftId,
          employeeId: shift.attendance.employeeId,
          recordedAt: shift.attendance.recordedAt.toISOString(),
          picture: shift.attendance.picture,
          status: shift.attendance.status,
          metadata: shift.attendance.metadata,
        }
      : null,
    createdBy: shift.createdBy,
    lastUpdatedBy: shift.lastUpdatedBy,
  }));

  const siteOptions = sites.map(site => ({ id: site.id, name: site.name }));
  const shiftTypeOptions = shiftTypes.map(shiftType => ({ id: shiftType.id, name: shiftType.name }));
  const employeeOptions: EmployeeSummary[] = employees.map(employee => ({
    id: employee.id,
    firstName: employee.firstName,
    lastName: employee.lastName,
    fullName: employee.fullName,
    employeeCode: employee.employeeCode,
  }));

  return (
    <div className="max-w-7xl mx-auto">
      <Suspense fallback={<div>Loading shifts...</div>}>
        <ShiftList
          shifts={shiftDtos}
          sites={siteOptions}
          shiftTypes={shiftTypeOptions}
          employees={employeeOptions}
          startDate={startDate}
          endDate={endDate}
          employeeId={employeeId}
          siteId={siteId}
          sort={sort}
          page={page}
          perPage={perPage}
          totalCount={totalCount}
        />
      </Suspense>
    </div>
  );
}
