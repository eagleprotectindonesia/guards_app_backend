import { ChatMessage } from './index';

/**
 * Shared Socket.io Event Definitions
 */

export interface ServerToClientEvents {
  // Chat events
  new_message: (message: ChatMessage) => void;
  messages_read: (data: { employeeId: string; messageIds?: string[]; readBy?: string }) => void;
  typing: (data: { employeeId: string; isTyping: boolean }) => void;
  conversation_locked: (data: { employeeId: string; lockedBy: string; expiresAt: number }) => void;
  
  // Dashboard events
  alert: (payload: any) => void;
  active_shifts: (payload: any) => void;
  upcoming_shifts: (payload: any) => void;
  'dashboard:backfill': (payload: { alerts: any[] }) => void;
  
  // Auth/System events
  'auth:force_logout': (data: { reason: string }) => void;
  'shift:updated': (data: { shiftId: string }) => void;
  error: (data: { message: string }) => void;
}

export interface ClientToServerEvents {
  // Chat events
  send_message: (data: {
    content: string;
    employeeId?: string;
    guardId?: string;
    attachments?: string[];
  }) => void;
  
  mark_read: (data: {
    messageIds: string[];
    employeeId?: string;
    guardId?: string;
  }) => void;
  
  typing: (data: {
    isTyping: boolean;
    employeeId?: string;
    guardId?: string;
  }) => void;

  // Dashboard events
  subscribe_site: (siteId: string) => void;
  request_dashboard_backfill: (data: { siteId?: string }) => void;
}

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  auth: {
    id: string;
    type: 'admin' | 'employee';
    tokenVersion?: number;
    clientType?: string;
  };
}
