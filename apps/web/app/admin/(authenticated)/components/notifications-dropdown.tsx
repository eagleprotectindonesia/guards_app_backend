'use client';

import { useMemo } from 'react';
import { Bell, Calendar, ChevronRight, ClipboardList, ShieldOff, Ticket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useNotificationsDropdown } from '../context/notifications-dropdown-context';
import { useSession } from '../context/session-context';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { AdminNavLink } from './admin-nav-link';
import { categorizeItem, type UnifiedNotificationItem } from './notification-row';
import { usePathname } from 'next/navigation';
import { cn } from '@repo/shared';
import { isDashboardPath } from '@/lib/admin-tab-routing';

const GROUPS: { key: ReturnType<typeof categorizeItem>; label: string; icon: typeof Bell; tab: string }[] = [
  { key: 'attendance_alert', label: 'Attendance Alerts', icon: ClipboardList, tab: 'attendance' },
  { key: 'checkin_alert', label: 'Check-in Alerts', icon: ShieldOff, tab: 'checkin' },
  { key: 'calendar', label: 'Calendar', icon: Calendar, tab: 'calendar' },
  { key: 'ticket', label: 'Tickets & Messages', icon: Ticket, tab: 'ticket' },
  { key: 'leave', label: 'Leave & HR', icon: ClipboardList, tab: 'leave' },
  { key: 'other', label: 'Other', icon: Bell, tab: 'all' },
];

const isUnread = (item: UnifiedNotificationItem) => (item.kind === 'alert' ? true : !item.readAt);

export default function NotificationsDropdown() {
  const { hasPermission } = useSession();
  const { items, unreadCount, activeAlertCount, isInitialized, markAllAsRead } = useNotificationsDropdown();
  const pathname = usePathname();
  const canViewAlerts = hasPermission(PERMISSIONS.ALERTS.VIEW);

  const groupCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of items) {
      if (!isUnread(item)) continue;
      const cat = categorizeItem(item);
      counts[cat] = (counts[cat] ?? 0) + 1;
    }
    return counts;
  }, [items]);

  if (!isInitialized) return null;

  const hasRedAlert = canViewAlerts && activeAlertCount > 0;
  const isOnDashboard = isDashboardPath(pathname);
  const isOnAlertsPage = pathname === '/admin/alerts';
  const showAlarmWarning = !isOnDashboard && !isOnAlertsPage && hasRedAlert;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'relative rounded-full',
            showAlarmWarning &&
              'bg-red-50 dark:bg-red-950/30 text-red-600 hover:text-red-700 hover:bg-red-100 dark:hover:bg-red-950/40'
          )}
          title="Notifications"
        >
          <Bell className={cn('h-5 w-5', showAlarmWarning && 'animate-bounce')} />
          {unreadCount > 0 && (
            <span
              className={cn(
                'absolute -top-1.5 -right-1.5 text-xs font-bold h-5 w-5 rounded-full flex items-center justify-center border-2 border-background shadow-sm',
                hasRedAlert && activeAlertCount > 0 ? 'bg-red-600 text-white' : 'bg-primary text-primary-foreground'
              )}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0 overflow-hidden" sideOffset={8}>
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <p className="text-sm font-semibold">Notifications</p>
          {unreadCount > 0 && (
            <button type="button" onClick={markAllAsRead} className="text-xs text-primary font-medium hover:underline">
              Mark all as read
            </button>
          )}
        </div>
        {unreadCount === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">No notifications yet.</div>
        ) : (
          <div className="max-h-96 overflow-y-auto divide-y divide-border">
            {GROUPS.filter(group => (groupCounts[group.key] ?? 0) > 0).map(group => {
              const count = groupCounts[group.key] ?? 0;
              const isCritical = group.key === 'attendance_alert' || group.key === 'checkin_alert';
              return (
                <AdminNavLink
                  key={group.key}
                  href={`/admin/notifications${group.tab === 'all' ? '' : `?tab=${group.tab}`}`}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 text-sm hover:bg-muted/50 transition-colors',
                    isCritical && 'text-red-600 dark:text-red-400'
                  )}
                >
                  <group.icon className="w-4 h-4 shrink-0" />
                  <span className={cn('flex-1 font-medium', isCritical ? 'font-semibold' : '')}>{group.label}</span>
                  <span
                    className={cn(
                      'inline-flex items-center justify-center h-5 min-w-5 rounded-full px-1.5 text-xs font-semibold',
                      isCritical
                        ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                        : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {count > 99 ? '99+' : count}
                  </span>
                </AdminNavLink>
              );
            })}
          </div>
        )}
        <div className="border-t">
          <AdminNavLink
            href="/admin/notifications"
            className="flex items-center justify-center gap-1 px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            View All Notifications
            <ChevronRight className="w-4 h-4" />
          </AdminNavLink>
        </div>
      </PopoverContent>
    </Popover>
  );
}
