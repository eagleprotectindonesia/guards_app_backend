import type { Attendance, Shift, ShiftType, Site } from '@repo/types';
import type { Serialized } from '@/lib/utils';

export type ShiftEmployeeSummary = {
  id: string;
  firstName: string;
  lastName?: string | null;
  fullName: string;
  employeeCode?: string | null;
};

export type ShiftWithRelationsDto = Shift & {
  site: Site;
  shiftType: ShiftType;
  employee: ShiftEmployeeSummary | null;
  attendance: Attendance | null;
  createdBy?: { name: string } | null;
  lastUpdatedBy?: { name: string } | null;
};

export type SerializedShiftWithRelationsDto = Serialized<ShiftWithRelationsDto>;
