import type { Attendance, Shift, ShiftType, Site } from '@repo/types';
import type { Serialized } from '@/lib/server-utils';
import type { EmployeeSummary } from '@repo/database';

export type ShiftWithRelationsDto = Shift & {
  site: Site;
  shiftType: ShiftType;
  employee: EmployeeSummary | null;
  attendance: Attendance | null;
  createdBy?: { name: string } | null;
  lastUpdatedBy?: { name: string } | null;
  swapsWithShift?: { id: string; employee: EmployeeSummary | null } | null;
  replacedByAdmin?: { name: string } | null;
  latestSwapReplacement?: {
    method: 'SWAP' | 'REPLACEMENT';
    previousEmployeeName: string | null;
    replacementReason?: string | null;
  } | null;
};

export type SerializedShiftWithRelationsDto = Serialized<ShiftWithRelationsDto>;
