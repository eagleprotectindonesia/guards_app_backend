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
export type OfficeAttendanceStatus =
  | 'present'
  | 'absent'
  | 'late'
  | 'pending_verification'
  | 'clocked_out'
  | 'pending_leave'
  | 'leave';
export type LeaveRequestStatus = 'pending' | 'pending_hr' | 'pending_manager' | 'approved' | 'rejected' | 'cancelled';
export type LeaveRequestReason =
  | 'sick'
  | 'family_marriage'
  | 'family_child_marriage'
  | 'family_child_circumcision_baptism'
  | 'family_death'
  | 'family_spouse_death'
  | 'special_maternity'
  | 'special_miscarriage'
  | 'special_paternity'
  | 'special_emergency'
  | 'annual';
export type LeaveMainCategory = 'sick' | 'family' | 'special' | 'annual';
export type EmployeeRole = 'on_site' | 'office';
export type EmployeeGender = 'male' | 'female';
export type OfficeJobTitleCategory = 'staff' | 'management';
export type OfficeShiftAttendanceMode = 'office_required' | 'non_office';
export type OfficeAttendancePolicySource = 'employee_default' | 'shift_override' | 'no_office_employee';
export type ShiftKind = 'onsite' | 'escort' | 'office_control' | 'event_temporary';
export type SiteKind = 'fixed' | 'escort' | 'event';
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
  gender?: EmployeeGender | null;
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
  roleSyncOverride?: boolean;
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
  cycleKey?: string | Date | null;
  requiresDocument?: boolean;
  isPaid?: boolean | null;
  deductedAnnualDays?: number;
  unpaidDays?: number;
  policySnapshot?: Record<string, unknown> | null;
  documentVerifiedAt?: string | Date | null;
  documentVerifiedById?: string | null;
  status: LeaveRequestStatus;
  reviewedById?: string | null;
  reviewedAt?: string | Date | null;
  managerApprovedById?: string | null;
  managerApprovedAt?: string | Date | null;
  managerApprovalNote?: string | null;
  hrApprovedById?: string | null;
  hrApprovedAt?: string | Date | null;
  hrApprovalNote?: string | null;
  cancelledAt?: string | Date | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface SitePost {
  id: string;
  siteId: string;
  name: string;
  address?: string | null;
  latitude: number;
  longitude: number;
  status?: boolean | null;
  sortOrder: number;
  deletedAt?: string | Date | null;
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
  kind?: SiteKind | null;
  status?: boolean | null;
  note?: string | null;
  posts?: SitePost[];
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
  status: OfficeAttendanceStatus;
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
  | 'completed'
  | 'pending_leave'
  | 'leave'
  | 'absent';

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
  kind: ShiftKind;
  escortEndSiteId?: string | null;
  date: string | Date;
  startsAt: string | Date;
  endsAt: string | Date;
  status: ShiftStatus;
  checkInStatus?: CheckInStatus | null;
  requiredCheckinIntervalMins: number;
  graceMinutes: number;
  lastHeartbeatAt?: string | Date | null;
  missedCount: number;
  departedAt?: string | Date | null;
  arrivedAt?: string | Date | null;
  groupShiftId?: string | null;
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
  escortEndSite?: Site | null;
  shiftType: ShiftType;
  employee?: Employee | null;
  attendance?: Attendance | null;
  groupShift?: GroupShift | null;
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

export type GroupChatParticipantType = 'admin' | 'employee';
export type GroupChatParticipantRole = 'owner' | 'admin' | 'member';
export type GroupChatParticipantStatus = 'active' | 'left' | 'removed';

export interface GroupChatParticipant {
  id: string;
  groupId: string;
  participantType: GroupChatParticipantType;
  adminId?: string | null;
  employeeId?: string | null;
  displayName: string;
  role: GroupChatParticipantRole;
  status: GroupChatParticipantStatus;
  joinedAt: string;
  visibleFromAt: string;
  leftAt?: string | null;
  unreadCount: number;
  isMuted: boolean;
  isArchived: boolean;
}

export interface GroupChatMessage {
  id: string;
  groupId: string;
  senderParticipantId: string;
  senderType: GroupChatParticipantType;
  adminId?: string | null;
  employeeId?: string | null;
  senderName: string;
  content: string;
  attachments: string[];
  latitude?: number | null;
  longitude?: number | null;
  status?: 'draft' | 'sent' | 'expired';
  createdAt: string;
  sentAt?: string | null;
  draftExpiresAt?: string | null;
}

export interface GroupChatConversation {
  kind: 'group';
  groupId: string;
  title: string;
  description?: string | null;
  groupShiftId?: string | null;
  memberCount: number;
  currentUserRole: GroupChatParticipantRole;
  isArchived: boolean;
  isMuted: boolean;
  unreadCount: number;
  lastMessage?: {
    content: string;
    senderName: string;
    createdAt: string;
  } | null;
}

export type ConversationKind = 'direct' | 'group';

export type ConversationKey = { kind: 'direct'; employeeId: string } | { kind: 'group'; groupId: string };

export interface ChatInboxItem {
  kind: ConversationKind;
  id: string;
  title: string;
  subtitle?: string;
  groupShiftId?: string | null;
  unreadCount: number;
  isMuted: boolean;
  isArchived: boolean;
  lastMessage?: {
    content: string;
    senderName: string;
    createdAt: string;
  } | null;
}

export interface GroupShift {
  id: string;
  siteId: string;
  endSiteId: string | null;
  shiftTypeId: string;
  date: string | Date;
  kind: ShiftKind;
  clientName?: string | null;
  note?: string | null;
  flexibleEndTime?: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type TicketStatus =
  | 'NEW'
  | 'ACKNOWLEDGED'
  | 'WAITING_INFORMATION'
  | 'IN_PROGRESS'
  | 'SOLVED'
  | 'CLOSED'
  | 'CANNOT_RESOLVE'
  | 'CANCELLED';
export type TicketClaimantType = 'ADMIN' | 'EMPLOYEE';

export interface Ticket {
  id: string;
  code: string;
  title: string;
  description: string;
  resolutionTargetHours: number;
  priority: TicketPriority;
  status: TicketStatus;
  submitterAdminId: string;
  claimedByType: TicketClaimantType | null;
  claimedByAdminId: string | null;
  claimedByEmployeeId: string | null;
  claimedAt: string | Date | null;
  departmentRoleId: string | null;
  clientName: string;
  clientContact: string;
  clientLocation: string;
  clientLocationLatitude: number | null;
  clientLocationLongitude: number | null;
  solvedAt: string | Date | null;
  closedAt: string | Date | null;
  cannotResolveAt: string | Date | null;
  cancelledAt: string | Date | null;
  cancellationNote: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  submitterAdmin?: { id: string; name: string };
  claimedByAdmin?: { id: string; name: string } | null;
  claimedByEmployee?: { id: string; fullName: string } | null;
}

export interface PanicAlert {
  id: number;
  userId: number;
  firstName: string;
  lastName: string;
  latitude: number;
  longitude: number;
  status: string;
  createdAt: string;
}

export interface PanicWebhookPayload {
  event: string;
  unresolvedPanics: PanicAlert[];
}

// ============================================================================
// Calendar Types
// ============================================================================
export type CalendarItemKind =
  | 'holiday'
  | 'office_memo'
  | 'leave'
  | 'meeting'
  | 'client_meeting'
  | 'reminder'
  | 'task'
  | 'deadline'
  | 'follow_up'
  | 'training'
  | 'personal_event'
  | 'other';

export interface CalendarItem {
  id: string;
  originalId: string;
  kind: CalendarItemKind;
  title: string;
  date: string;
  startsAt: string | null;
  endsAt: string | null;
  allDay: boolean;
  priority: 'urgent' | 'high' | 'normal' | 'low' | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  status: string | null;
  colorHint: string | null;
}

export type CalendarDetailKind = CalendarItemKind;

export interface CalendarDetailResponse {
  item: {
    kind: CalendarDetailKind;
    data: Record<string, unknown>;
  };
}

export type CalendarEventKind =
  | 'meeting'
  | 'client_meeting'
  | 'reminder'
  | 'task'
  | 'follow_up'
  | 'training'
  | 'personal_event'
  | 'other';

export interface TaggedUser {
  id: string;
  type: 'employee' | 'admin';
  name: string;
  email?: string;
}

export interface TaggedDepartment {
  name: string;
}

export interface CreateCalendarEventInput {
  kind: CalendarEventKind;
  title: string;
  description?: string;
  startDate: string;
  endDate: string;
  startTime?: string;
  endTime?: string;
  allDay: boolean;
  location?: string;
  latitude?: number | null;
  longitude?: number | null;
  clientName?: string;
  trainerName?: string;
  priority?: 'urgent' | 'high' | 'normal' | 'low';
  color?: string;
  taggedEmployeeIds?: string[];
  taggedAdminIds?: string[];
  taggedDepartmentNames?: string[];
}

export interface UpdateCalendarEventInput {
  kind?: CalendarEventKind;
  title?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  allDay?: boolean;
  location?: string;
  latitude?: number | null;
  longitude?: number | null;
  clientName?: string;
  trainerName?: string;
  priority?: 'urgent' | 'high' | 'normal' | 'low';
  color?: string;
  taggedEmployeeIds?: string[];
  taggedAdminIds?: string[];
  taggedDepartmentNames?: string[];
}

export interface CalendarEventItem {
  id: string;
  kind: CalendarEventKind;
  title: string;
  description: string | null;
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  allDay: boolean;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  clientName: string | null;
  trainerName: string | null;
  priority: 'urgent' | 'high' | 'normal' | 'low' | null;
  color: string | null;
  taggedUsers: TaggedUser[];
  taggedDepartments: TaggedDepartment[];
  createdAt: string;
  updatedAt: string;
  ownerId: string;
  ownerType: 'employee' | 'admin';
  ownerName: string;
}

export interface CalendarEventChangelogActor {
  type: 'admin' | 'employee' | 'system';
  id: string | null;
  name: string | null;
}

export interface CalendarEventChangelogItem {
  id: string;
  action: string;
  createdAt: string;
  actor: CalendarEventChangelogActor;
  details: Record<string, unknown> | null;
}

export * from './socket-events';
