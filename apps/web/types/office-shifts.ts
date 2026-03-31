import type { OfficeAttendance, OfficeShift, OfficeShiftType } from '@repo/types';
import type { Serialized } from '@/lib/server-utils';
import type { EmployeeSummary } from '@repo/database';

export type OfficeShiftWithRelationsDto = OfficeShift & {
  officeShiftType: OfficeShiftType;
  employee: EmployeeSummary;
  officeAttendances: OfficeAttendance[];
  createdBy?: { name: string } | null;
  lastUpdatedBy?: { name: string } | null;
};

export type SerializedOfficeShiftWithRelationsDto = Serialized<OfficeShiftWithRelationsDto>;
