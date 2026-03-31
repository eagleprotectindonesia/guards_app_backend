export type OfficeShiftTypeWithAdminInfoDto = {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: { name: string } | null;
  lastUpdatedBy: { name: string } | null;
};

export type SerializedOfficeShiftTypeWithAdminInfoDto = Omit<
  OfficeShiftTypeWithAdminInfoDto,
  'createdAt' | 'updatedAt'
> & {
  createdAt: string;
  updatedAt: string;
};
