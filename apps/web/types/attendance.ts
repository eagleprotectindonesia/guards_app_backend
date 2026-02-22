export type AttendanceMetadataDto = {
  location?: {
    lat: number;
    lng: number;
  };
  latenessMins?: number;
};

export type AttendanceEmployeeSummary = {
  id: string;
  fullName: string;
};

export type AttendanceWithRelationsDto = {
  id: string;
  recordedAt: Date;
  status: string;
  employeeId: string | null;
  shiftId: string;
  metadata: AttendanceMetadataDto | null;
  shift: {
    id: string;
    date: Date;
    site: {
      id: string;
      name: string;
    };
    shiftType: {
      id: string;
      name: string;
    };
  };
  employee: AttendanceEmployeeSummary | null;
};

export type SerializedAttendanceWithRelationsDto = Omit<
  AttendanceWithRelationsDto,
  'recordedAt' | 'shift'
> & {
  recordedAt: string;
  shift: Omit<AttendanceWithRelationsDto['shift'], 'date'> & {
    date: string;
  };
};

export type OfficeAttendanceMetadataDto = {
  location?: {
    lat: number;
    lng: number;
  };
};

export type OfficeAttendanceWithRelationsDto = {
  id: string;
  recordedAt: Date;
  status: string;
  employeeId: string;
  officeId: string;
  metadata: OfficeAttendanceMetadataDto | null;
  office: {
    id: string;
    name: string;
  } | null;
  employee: AttendanceEmployeeSummary | null;
};

export type SerializedOfficeAttendanceWithRelationsDto = Omit<
  OfficeAttendanceWithRelationsDto,
  'recordedAt'
> & {
  recordedAt: string;
};
