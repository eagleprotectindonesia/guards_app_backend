import { ChatMessage, GroupChatMessage, GroupChatParticipant, PanicAlert } from './index';

/**
 * Shared Socket.io Event Definitions
 */

export type AdminNotificationEventItem = {
  id: string;
  adminId: string;
  type: 'leave_request_created' | 'ticket_assigned_role' | 'ticket_status_updated' | 'ticket_message_added';
  title: string;
  body: string;
  payload: any;
  readAt: string | null;
  createdAt: string;
};

export interface ServerToClientEvents {
  // Chat events
  new_message: (message: ChatMessage) => void;
  messages_read: (data: { employeeId: string; messageIds: string[]; readBy?: string }) => void;
  typing: (data: { employeeId: string; isTyping: boolean }) => void;
  conversation_locked: (data: { employeeId: string; lockedBy: string; expiresAt: number }) => void;
  group_new_message: (message: GroupChatMessage) => void;
  group_messages_read: (data: {
    groupId: string;
    participantId: string;
    messageIds?: string[];
    readAt: string;
  }) => void;
  group_typing: (data: { groupId: string; participantId: string; participantName: string; isTyping: boolean }) => void;
  group_member_added: (data: { groupId: string; participant: GroupChatParticipant }) => void;
  group_member_removed: (data: { groupId: string; participantId: string; removedByParticipantId?: string }) => void;
  group_owner_changed: (data: {
    groupId: string;
    previousOwnerParticipantId: string;
    newOwnerParticipantId: string;
  }) => void;
  group_updated: (data: { groupId: string; title?: string; description?: string | null }) => void;

  // Dashboard events
  alert: (payload: any) => void;
  active_shifts: (payload: any) => void;
  upcoming_shifts: (payload: any) => void;
  'dashboard:backfill': (payload: { alerts: any[] }) => void;
  'new_dashboard:critical_alerts': (payload: { alerts: any[] }) => void;
  'new_dashboard:shift_overview': (payload: {
    dateKey: string;
    onDuty: number;
    onDutySiteGuards: number;
    onDutyPatrol: number;
    upcoming: number;
    completed: number;
    absent: number;
    carryoverOnDuty: number;
    total: number;
    lastUpdatedAt: string;
  }) => void;
  'new_dashboard:live_activity_feed': (payload: {
    items: {
      id: string;
      kind: 'attendance' | 'checkin';
      occurredAt: string;
      guardName: string;
      siteName: string;
      status: string;
      shiftId: string;
      employeeId: string | null;
    }[];
  }) => void;
  'new_dashboard:live_activity_event': (payload: {
    item: {
      id: string;
      kind: 'attendance' | 'checkin';
      occurredAt: string;
      guardName: string;
      siteName: string;
      status: string;
      shiftId: string;
      employeeId: string | null;
    };
  }) => void;
  'new_dashboard:total_incidents': (payload: {
    dateKey: string;
    total: number;
    guard: number;
    onsite: number;
    yesterdayTotal: number;
    deltaVsYesterday: number;
    lastUpdatedAt: string;
  }) => void;
  'new_dashboard:total_attendance': (payload: {
    dateKey: string;
    attendanceRate: number;
    attendedCount: number;
    eligibleCount: number;
    attendanceRateSiteGuards: number;
    attendanceRatePatrol: number;
    yesterdayAttendanceRate: number;
    deltaVsYesterday: number;
    lastUpdatedAt: string;
  }) => void;
  'new_dashboard:top_sites_activity': (payload: {
    windowStart: string;
    windowEnd: string;
    sites: {
      siteId: string;
      siteName: string;
      total: number;
      guard: number;
      onsite: number;
      lastAlertAt: string;
    }[];
    lastUpdatedAt: string;
  }) => void;
  admin_notification_created: (payload: { notification: AdminNotificationEventItem; unreadCount: number }) => void;
  admin_notifications_backfill: (payload: { notifications: AdminNotificationEventItem[]; unreadCount: number }) => void;
  admin_notifications_read: (payload: { readIds: string[]; unreadCount: number }) => void;

  // Auth/System events
  'auth:force_logout': (data: { reason: string }) => void;
  'shift:updated': (data: { shiftId: string }) => void;
  error: (data: { message: string }) => void;

  // Ticket events
  ticket_created: (payload: { ticket: any }) => void;
  ticket_status_updated: (payload: { ticketId: string; status: string; ticket: any }) => void;
  ticket_message_added: (payload: { ticketId: string; message: any }) => void;
  hr_live_activity: (payload: unknown) => void;
  'new_dashboard:panic_alerts': (payload: { unresolvedPanics: PanicAlert[] }) => void;
}

export interface ClientToServerEvents {
  // Chat events
  send_message: (data: {
    content: string;
    messageId?: string;
    employeeId?: string;
    guardId?: string;
    attachments?: string[];
    latitude?: number;
    longitude?: number;
  }) => void;

  mark_read: (data: { messageIds: string[]; employeeId?: string; guardId?: string }) => void;

  typing: (data: { isTyping: boolean; employeeId?: string; guardId?: string }) => void;
  group_send_message: (data: {
    groupId: string;
    messageId?: string;
    content: string;
    attachments?: string[];
    latitude?: number;
    longitude?: number;
  }) => void;
  group_mark_read: (data: { groupId: string; messageIds?: string[] }) => void;
  group_typing: (data: { groupId: string; isTyping: boolean }) => void;

  // Dashboard events
  subscribe_site: (siteId: string) => void;
  request_dashboard_backfill: (data: { siteId?: string }) => void;
  request_new_dashboard_backfill: (data: {
    cards: (
      | 'critical_alerts'
      | 'shift_overview'
      | 'live_activity_feed'
      | 'total_incidents'
      | 'total_attendance'
      | 'top_sites_activity'
    )[];
    siteId?: string;
  }) => void;
  request_admin_notifications_backfill: (data: { limit?: number }) => void;
  mark_admin_notifications_read: (data: { notificationIds: string[] }) => void;

  // Ticket events
  subscribe_ticket: (ticketId: string) => void;
  unsubscribe_ticket: (ticketId: string) => void;
}

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  auth: {
    id: string;
    type: 'admin' | 'employee';
    sessionId?: string;
    clientType?: string;
    permissions?: string[];
  };
}
