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
  employeeNumber: string | null;
  department?: string | null;
  jobTitle?: string | null;
};

export type AttendanceOfficeSummary = {
  id: string;
  name: string;
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
  distanceMeters?: number;
  latenessMins?: number;
};

export type OfficeAttendanceWithRelationsDto = {
  id: string;
  recordedAt: Date;
  status: string;
  employeeId: string;
  officeId: string | null;
  metadata: OfficeAttendanceMetadataDto | null;
  office: {
    id: string;
    name: string;
  } | null;
  officeShift?: {
    id: string;
    officeShiftType: {
      name: string;
      startTime: string;
      endTime: string;
    } | null;
  } | null;
  employee: AttendanceEmployeeSummary | null;
};

export type SerializedOfficeAttendanceWithRelationsDto = Omit<
  OfficeAttendanceWithRelationsDto,
  'recordedAt'
> & {
  recordedAt: string;
};

export type OfficeAttendanceDisplayStatus = 'clocked_in' | 'completed' | 'late';

export type OfficeAttendanceDisplayDto = {
  id: string;
  employeeId: string;
  officeId: string | null;
  businessDate: string;
  clockInAt: string;
  clockOutAt: string | null;
  paidHours: string | null;
  clockInMetadata: OfficeAttendanceMetadataDto | null;
  clockOutMetadata: OfficeAttendanceMetadataDto | null;
  latenessMins: number | null;
  displayStatus: OfficeAttendanceDisplayStatus;
  office: {
    id: string;
    name: string;
  } | null;
  officeShift?: {
    id: string;
    officeShiftType: {
      name: string;
      startTime: string;
      endTime: string;
    } | null;
  } | null;
  employee: AttendanceEmployeeSummary | null;
};

export type SerializedOfficeAttendanceDisplayDto = OfficeAttendanceDisplayDto;
