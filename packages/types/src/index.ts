export type ActionState<T = Record<string, unknown>> = {
  message?: string;
  errors?: {
    [K in keyof T]?: string[];
  };
  success?: boolean;
};

export type ShiftStatus = 'scheduled' | 'in_progress' | 'completed' | 'missed' | 'cancelled';
export type CheckInStatus = 'on_time' | 'late' | 'invalid';
export type AttendanceStatus = 'present' | 'absent' | 'late' | 'pending_verification' | 'clocked_out';
export type EmployeeRole = 'on_site' | 'office';

export interface Department {
  id: string;
  name: string;
  note?: string | null;
}

export interface Designation {
  id: string;
  name: string;
  role: EmployeeRole;
  departmentId: string;
  note?: string | null;
}

export interface Office {
  id: string;
  name: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  status?: boolean | null;
  note?: string | null;
}

export interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  name: string; // Computed/Backward compatibility
  phone: string;
  employeeCode?: string | null;
  role: EmployeeRole;
  status?: boolean | null;
  departmentId?: string | null;
  designationId?: string | null;
  officeId?: string | null;
  department?: Department | null;
  designation?: Designation | null;
  office?: Office | null;
  joinDate?: string | Date | null;
  leftDate?: string | Date | null;
  note?: string | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

// Deprecated: Use Employee instead
export type Guard = Employee & { guardCode?: string | null };

export interface Site {
  id: string;
  name: string;
  clientName?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  status?: boolean | null;
  note?: string | null;
}

export interface ShiftType {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
}

export interface Attendance {
  id: string;
  shiftId: string;
  employeeId?: string | null;
  recordedAt: string | Date;
  picture?: string | null;
  status: AttendanceStatus;
  metadata?: any;
}

export interface OfficeAttendance {
  id: string;
  officeId: string;
  employeeId: string;
  recordedAt: string | Date;
  picture?: string | null;
  status: AttendanceStatus;
  metadata?: any;
  office?: Office | null;
  employee?: Employee | null;
}

// Deprecated: Use Attendance with employeeId
export interface GuardAttendance extends Attendance {
  guardId?: string | null;
}

export interface Shift {
  id: string;
  siteId: string;
  shiftTypeId: string;
  employeeId?: string | null;
  date: string | Date;
  startsAt: string | Date;
  endsAt: string | Date;
  status: ShiftStatus;
  checkInStatus?: CheckInStatus | null;
  requiredCheckinIntervalMins: number;
  graceMinutes: number;
  lastHeartbeatAt?: string | Date | null;
  missedCount: number;
  note?: string | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

// Deprecated: Use Shift with employeeId
export interface GuardShift extends Shift {
  guardId?: string | null;
}

export interface ShiftWithRelations extends Shift {
  site: Site;
  shiftType: ShiftType;
  employee?: Employee | null;
  attendance?: Attendance | null;
}

// Deprecated: Use ShiftWithRelations
export interface GuardShiftWithRelations extends ShiftWithRelations {
  guard?: Guard | null;
}

export interface Conversation {
  employeeId: string;
  employeeName: string;
  lastMessage: {
    content: string;
    sender: string;
    createdAt: string;
    adminId?: string;
    adminName?: string;
  };
  unreadCount: number;
}

export interface ChatMessage {
  id: string;
  employeeId: string;
  adminId?: string | null;
  admin?: {
    id: string;
    name: string;
  } | null;
  sender: 'admin' | 'employee';
  content: string;
  attachments: string[];
  createdAt: string;
  readAt?: string | null;
}

export * from './socket-events';
