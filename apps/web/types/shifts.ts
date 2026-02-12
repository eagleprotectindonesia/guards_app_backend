import type { Attendance, Shift, ShiftType, Site } from '@repo/types';
import type { Serialized } from '@/lib/utils';
import type { EmployeeSummary } from '@repo/database';

export type ShiftWithRelationsDto = Shift & {
  site: Site;
  shiftType: ShiftType;
  employee: EmployeeSummary | null;
  attendance: Attendance | null;
  createdBy?: { name: string } | null;
  lastUpdatedBy?: { name: string } | null;
};

export type SerializedShiftWithRelationsDto = Serialized<ShiftWithRelationsDto>;
