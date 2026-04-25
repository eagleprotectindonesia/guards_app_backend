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
export type LeaveRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type LeaveRequestReason = 'sick' | 'casual' | 'emergency';
export type EmployeeRole = 'on_site' | 'office';
export type OfficeJobTitleCategory = 'staff' | 'management';
export type OfficeShiftAttendanceMode = 'office_required' | 'non_office';
export type OfficeAttendancePolicySource = 'employee_default' | 'shift_override' | 'no_office_employee';
export type EmailTemplateId = 'admin.leave_request_created';

export interface EmailRecipient {
  email: string;
  name?: string | null;
}

export interface EmailEventPayload {
  templateId: EmailTemplateId;
  to: EmailRecipient[];
  context: Record<string, string>;
  metadata?: Record<string, string>;
  idempotencyKey: string;
}

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
  fullName: string;
  phone?: string;
  personnelId: string;
  employeeNumber?: string | null;
  role: EmployeeRole;
  status?: boolean | null;
  mustChangePassword?: boolean;
  jobTitle?: string | null;
  department?: string | null;
  officeId?: string | null;
  fieldModeEnabled?: boolean;
  jobTitleCategory?: OfficeJobTitleCategory | null;
  isFieldModeEditable?: boolean;
  fieldModeReasonCode?:
    | 'non_office'
    | 'missing_office'
    | 'staff_with_office'
    | 'management_with_office'
    | 'uncategorized_with_office';
  office?: Office | null;
  joinDate?: string | Date | null;
  leftDate?: string | Date | null;
  note?: string | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  leaveRequests?: EmployeeLeaveRequest[];
}

export interface EmployeeLeaveRequest {
  id: string;
  employeeId: string;
  startDate: string | Date;
  endDate: string | Date;
  reason: LeaveRequestReason;
  employeeNote?: string | null;
  adminNote?: string | null;
  attachments: string[];
  status: LeaveRequestStatus;
  reviewedById?: string | null;
  reviewedAt?: string | Date | null;
  cancelledAt?: string | Date | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

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

export interface OfficeShiftType {
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
  officeId?: string | null;
  officeShiftId?: string | null;
  employeeId: string;
  recordedAt: string | Date;
  picture?: string | null;
  status: AttendanceStatus;
  metadata?: any;
  office?: Office | null;
  employee?: Employee | null;
}

export interface OfficeShift {
  id: string;
  officeShiftTypeId: string;
  employeeId: string;
  date: string | Date;
  startsAt: string | Date;
  endsAt: string | Date;
  attendanceMode?: OfficeShiftAttendanceMode | null;
  status: ShiftStatus;
  note?: string | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export type OfficeAttendanceWindowStatus =
  | 'non_working_day'
  | 'available'
  | 'missed'
  | 'clocked_in'
  | 'completed';

export interface OfficeAttendanceState {
  status: OfficeAttendanceWindowStatus;
  canClockIn: boolean;
  canClockOut: boolean;
  windowClosed: boolean;
  messageCode?: string | null;
  latestAttendance?: OfficeAttendance | null;
}

export interface OfficeWorkScheduleDay {
  id: string;
  scheduleId: string;
  weekday: number;
  isWorkingDay: boolean;
  startTime?: string | null;
  endTime?: string | null;
}

export interface OfficeWorkSchedule {
  id: string;
  code: string;
  name: string;
  days?: OfficeWorkScheduleDay[];
}

export interface EmployeeOfficeWorkScheduleAssignment {
  id: string;
  employeeId: string;
  officeWorkScheduleId: string;
  effectiveFrom: string | Date;
  effectiveUntil?: string | Date | null;
  officeWorkSchedule?: OfficeWorkSchedule | null;
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

export interface Conversation {
  employeeId: string;
  employeeName: string;
  employeeNumber: string;
  isArchived: boolean;
  isMuted: boolean;
  isDraft?: boolean;
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
  latitude?: number | null;
  longitude?: number | null;
  status?: 'draft' | 'sent' | 'expired';
  createdAt: string;
  sentAt?: string | null;
  draftExpiresAt?: string | null;
  readAt?: string | null;
}

export * from './socket-events';
