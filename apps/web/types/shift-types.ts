export type ShiftTypeWithAdminInfoDto = {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: { name: string } | null;
  lastUpdatedBy: { name: string } | null;
};

export type SerializedShiftTypeWithAdminInfoDto = Omit<
  ShiftTypeWithAdminInfoDto,
  'createdAt' | 'updatedAt'
> & {
  createdAt: string;
  updatedAt: string;
};
