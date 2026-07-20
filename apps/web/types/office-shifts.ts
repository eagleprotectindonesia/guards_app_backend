import type { OfficeAttendance, OfficeShift, OfficeShiftType } from '@repo/types';
import type { Serialized } from '@/lib/server-utils';
import type { EmployeeSummary } from '@repo/database';

export type OfficeShiftWithRelationsDto = OfficeShift & {
  officeShiftType: OfficeShiftType;
  employee: EmployeeSummary;
  officeAttendances: OfficeAttendance[];
  createdBy?: { name: string } | null;
  lastUpdatedBy?: { name: string } | null;
  latestSwapReplacement?: LatestOfficeShiftSwapReplacement | null;
};

export type SerializedOfficeShiftWithRelationsDto = Serialized<OfficeShiftWithRelationsDto>;

export type LatestOfficeShiftSwapReplacement = {
  method: 'SWAP' | 'REPLACEMENT';
  previousEmployeeName: string | null;
  swapPartnerName?: string | null;
  replacementReason?: string | null;
};
