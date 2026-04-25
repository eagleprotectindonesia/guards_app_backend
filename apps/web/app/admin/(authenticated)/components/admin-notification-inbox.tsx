'use client';

import { Bell } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAdminNotifications } from '../context/admin-notification-context';
import { useSession } from '../context/session-context';
import { PERMISSIONS } from '@/lib/auth/permissions';

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AdminNotificationInbox() {
  const { hasPermission } = useSession();
  const { notifications, unreadCount, isInitialized, markVisibleAsRead } = useAdminNotifications();
  const canViewLeaveRequests = hasPermission(PERMISSIONS.LEAVE_REQUESTS.VIEW);

  if (!canViewLeaveRequests || !isInitialized) {
    return null;
  }

  return (
    <Popover onOpenChange={open => (open ? markVisibleAsRead() : undefined)}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative rounded-full" title="Notifications">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 bg-primary text-primary-foreground text-xs font-bold h-5 w-5 rounded-full flex items-center justify-center border-2 border-background shadow-sm">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0 overflow-hidden">
        <div className="px-4 py-3 border-b">
          <p className="text-sm font-semibold">Notifications</p>
          <p className="text-xs text-muted-foreground">Leave request updates for your ownership scope</p>
        </div>
        {notifications.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">No notifications yet.</div>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            {notifications.map(notification => {
              const targetPath =
                notification.payload && typeof notification.payload.targetPath === 'string'
                  ? notification.payload.targetPath
                  : '/admin/leave-requests';

              return (
                <Link
                  key={notification.id}
                  href={targetPath}
                  className={`block px-4 py-3 border-b last:border-b-0 hover:bg-muted/50 ${
                    notification.readAt ? '' : 'bg-primary/5'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium">{notification.title}</p>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatTimestamp(notification.createdAt)}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{notification.body}</p>
                </Link>
              );
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
