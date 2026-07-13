'use client';

import {
  AlertTriangle,
  Bell,
  CalendarClock,
  CalendarPlus,
  ClipboardList,
  Clock,
  MessageSquare,
  RefreshCw,
  ShieldOff,
  UserPlus,
} from 'lucide-react';
import { cn } from '@repo/shared';
import { AdminNavLink } from './admin-nav-link';
import { NotificationTypePill, type NotificationTag } from './notification-type-pill';
import { formatRelativeTime } from '@/lib/format-relative-time';

export type UnifiedNotificationItem =
  | {
      kind: 'alert';
      id: string;
      createdAt: string;
      title: string;
      body: string;
      tag: NotificationTag;
      icon: typeof AlertTriangle;
      iconColor: string;
      iconBg: string;
      borderColor: string;
      targetPath: string;
    }
  | {
      kind: 'notification';
      id: string;
      createdAt: string;
      readAt: string | null;
      title: string;
      body: string;
      tag: NotificationTag;
      icon: typeof AlertTriangle;
      iconColor: string;
      iconBg: string;
      targetPath: string;
    };

interface NotificationRowProps {
  item: UnifiedNotificationItem;
}

const iconSize = 'w-4 h-4';

export function buildNotificationRowFromAlert(
  alert: {
    id: string;
    createdAt: string | Date;
    reason: string;
    severity: string;
    status?: string;
    shift?: { employee?: { fullName: string } | null } | null;
    site?: { name: string } | null;
  },
  targetPath: string
): UnifiedNotificationItem {
  const isCritical = alert.severity === 'critical';
  const isNeedAttention = alert.status === 'need_attention';
  const isGeofence = alert.reason === 'geofence_breach' || alert.reason === 'location_services_disabled';
  const guardName = alert.shift?.employee?.fullName ?? 'Unknown';
  const siteName = alert.site?.name ?? 'Unknown site';

  let tag: NotificationTag;
  let icon: typeof AlertTriangle;
  let iconColor: string;
  let iconBg: string;
  let borderColor: string;
  let title: string;
  let body: string;

  if (isNeedAttention) {
    tag = 'Warning';
    icon = Clock;
    iconColor = 'text-yellow-600';
    iconBg = 'bg-yellow-100 dark:bg-yellow-900/30';
    borderColor = 'border-l-yellow-400';
    title = 'Attention Needed';
    body = `${guardName} at ${siteName} requires attention.`;
  } else if (isCritical || isGeofence) {
    tag = 'Critical';
    icon = isGeofence ? ShieldOff : AlertTriangle;
    iconColor = 'text-red-600';
    iconBg = 'bg-red-100 dark:bg-red-900/30';
    borderColor = 'border-l-red-500';
    title = isGeofence
      ? 'Geofence Breach'
      : alert.reason === 'missed_attendance'
        ? 'Missed Attendance'
        : 'Missed Check-in';
    body = `${guardName} at ${siteName}.`;
  } else {
    tag = 'Alert';
    icon = AlertTriangle;
    iconColor = 'text-orange-600';
    iconBg = 'bg-orange-100 dark:bg-orange-900/30';
    borderColor = 'border-l-orange-400';
    title = alert.reason.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    body = `${guardName} at ${siteName}.`;
  }

  return {
    kind: 'alert',
    id: alert.id,
    createdAt: typeof alert.createdAt === 'string' ? alert.createdAt : alert.createdAt.toISOString(),
    title,
    body,
    tag,
    icon,
    iconColor,
    iconBg,
    borderColor,
    targetPath,
  };
}

type NotificationType =
  | 'leave_request_created'
  | 'ticket_assigned_role'
  | 'ticket_status_updated'
  | 'ticket_message_added'
  | 'calendar_event_tagged'
  | 'calendar_event_reminder';

const notificationTypeConfig: Record<
  NotificationType,
  { tag: NotificationTag; icon: typeof AlertTriangle; iconColor: string; iconBg: string }
> = {
  leave_request_created: {
    tag: 'Leave',
    icon: ClipboardList,
    iconColor: 'text-amber-600',
    iconBg: 'bg-amber-100 dark:bg-amber-900/30',
  },
  ticket_assigned_role: {
    tag: 'Ticket',
    icon: UserPlus,
    iconColor: 'text-blue-600',
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
  },
  ticket_status_updated: {
    tag: 'Ticket',
    icon: RefreshCw,
    iconColor: 'text-blue-600',
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
  },
  ticket_message_added: {
    tag: 'Message',
    icon: MessageSquare,
    iconColor: 'text-blue-600',
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
  },
  calendar_event_tagged: {
    tag: 'Calendar',
    icon: CalendarPlus,
    iconColor: 'text-purple-600',
    iconBg: 'bg-purple-100 dark:bg-purple-900/30',
  },
  calendar_event_reminder: {
    tag: 'Calendar',
    icon: CalendarClock,
    iconColor: 'text-purple-600',
    iconBg: 'bg-purple-100 dark:bg-purple-900/30',
  },
};

export function buildNotificationRowFromAdminNotification(notification: {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
  payload?: { targetPath?: string } | null;
}): UnifiedNotificationItem {
  const config = notificationTypeConfig[notification.type] ?? {
    tag: 'Alert' as NotificationTag,
    icon: Bell,
    iconColor: 'text-muted-foreground',
    iconBg: 'bg-muted',
  };
  const targetPath = notification.payload?.targetPath ?? '/admin/leave-requests';

  return {
    kind: 'notification',
    id: notification.id,
    createdAt: notification.createdAt,
    readAt: notification.readAt,
    title: notification.title,
    body: notification.body,
    tag: config.tag,
    icon: config.icon,
    iconColor: config.iconColor,
    iconBg: config.iconBg,
    targetPath,
  };
}

export type NotificationCategory = 'critical_alert' | 'calendar' | 'ticket' | 'leave' | 'other';

export function categorizeItem(item: UnifiedNotificationItem): NotificationCategory {
  if (item.kind === 'alert') return 'critical_alert';
  if (item.tag === 'Calendar') return 'calendar';
  if (item.tag === 'Ticket' || item.tag === 'Message') return 'ticket';
  if (item.tag === 'Leave') return 'leave';
  return 'other';
}

export function NotificationRow({ item }: NotificationRowProps) {
  const isUnread = item.kind === 'notification' && !item.readAt;

  return (
    <AdminNavLink
      href={item.targetPath}
      className={cn(
        'block px-4 py-3 border-b last:border-b-0 hover:bg-muted/50',
        item.kind === 'alert'
          ? cn('border-l-2', (item as Extract<UnifiedNotificationItem, { kind: 'alert' }>).borderColor)
          : '',
        isUnread ? 'bg-primary/5' : ''
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn('p-1.5 rounded-lg shrink-0 mt-0.5', item.iconBg)}>
          <item.icon className={cn(iconSize, item.iconColor)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className={cn('text-sm truncate', isUnread ? 'font-semibold' : 'font-medium')}>{item.title}</p>
            <span className="text-[11px] text-muted-foreground whitespace-nowrap shrink-0">
              {formatRelativeTime(item.createdAt)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{item.body}</p>
          <div className="mt-1.5">
            <NotificationTypePill tag={item.tag} />
          </div>
        </div>
      </div>
    </AdminNavLink>
  );
}
