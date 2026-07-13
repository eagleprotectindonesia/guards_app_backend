'use client';

import { Bell, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useNotificationsDropdown } from '../context/notifications-dropdown-context';
import { useSession } from '../context/session-context';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { AdminNavLink } from './admin-nav-link';
import { NotificationRow } from './notification-row';
import { usePathname } from 'next/navigation';
import { cn } from '@repo/shared';
import { isDashboardPath } from '@/lib/admin-tab-routing';

export default function NotificationsDropdown() {
  const { hasPermission } = useSession();
  const { dropdownItems: items, unreadCount, activeAlertCount, isInitialized, markAllAsRead } = useNotificationsDropdown();
  const pathname = usePathname();
  const canViewAlerts = hasPermission(PERMISSIONS.ALERTS.VIEW);
  const canViewAll = items.length > 0;

  if (!isInitialized) return null;

  const hasRedAlert = canViewAlerts && activeAlertCount > 0;
  const isOnDashboard = isDashboardPath(pathname);
  const isOnAlertsPage = pathname === '/admin/alerts';
  const showAlarmWarning = !isOnDashboard && !isOnAlertsPage && hasRedAlert;

  return (
    <Popover onOpenChange={open => (open ? markAllAsRead() : undefined)}>
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
        {!canViewAll ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">No notifications yet.</div>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            {items.map(item => (
              <NotificationRow key={`${item.kind}-${item.id}`} item={item} />
            ))}
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
