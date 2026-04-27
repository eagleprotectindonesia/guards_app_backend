export type OfficeMemoWithAdminInfoDto = {
  id: string;
  title: string;
  message: string | null;
  startDate: Date;
  endDate: Date;
  scope: 'all' | 'department';
  departmentKeys: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: { name: string } | null;
  lastUpdatedBy: { name: string } | null;
};

export type SerializedOfficeMemoWithAdminInfoDto = Omit<
  OfficeMemoWithAdminInfoDto,
  'startDate' | 'endDate' | 'createdAt' | 'updatedAt'
> & {
  startDate: string;
  endDate: string;
  createdAt: string;
  updatedAt: string;
};
