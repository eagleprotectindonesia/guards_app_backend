'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useSocket } from '@/components/socket-provider';
import { useSession } from './session-context';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { AdminNotificationEventItem } from '@repo/types';

type AdminNotificationContextType = {
  notifications: AdminNotificationEventItem[];
  unreadCount: number;
  isInitialized: boolean;
  markVisibleAsRead: () => void;
};

const AdminNotificationContext = createContext<AdminNotificationContextType | undefined>(undefined);

const BACKFILL_LIMIT = 20;

export function AdminNotificationProvider({ children }: { children: React.ReactNode }) {
  const { socket, isConnected } = useSocket();
  const { hasPermission } = useSession();
  const canViewLeaveRequests = hasPermission(PERMISSIONS.LEAVE_REQUESTS.VIEW);

  const [notifications, setNotifications] = useState<AdminNotificationEventItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [hasReceivedBackfill, setHasReceivedBackfill] = useState(false);

  const isInitialized = !canViewLeaveRequests || hasReceivedBackfill;

  useEffect(() => {
    if (!socket || !canViewLeaveRequests) {
      return;
    }

    if (isConnected) {
      socket.emit('request_admin_notifications_backfill', { limit: BACKFILL_LIMIT });
    }

    const handleBackfill = (payload: { notifications: AdminNotificationEventItem[]; unreadCount: number }) => {
      setNotifications(payload.notifications);
      setUnreadCount(payload.unreadCount);
      setHasReceivedBackfill(true);
    };

    const handleCreated = (payload: { notification: AdminNotificationEventItem; unreadCount: number }) => {
      setNotifications(prev => [payload.notification, ...prev.filter(item => item.id !== payload.notification.id)]);
      setUnreadCount(payload.unreadCount);
    };

    const handleRead = (payload: { readIds: string[]; unreadCount: number }) => {
      const ids = new Set(payload.readIds);
      setNotifications(prev =>
        prev.map(item => (ids.has(item.id) ? { ...item, readAt: item.readAt ?? new Date().toISOString() } : item))
      );
      setUnreadCount(payload.unreadCount);
    };

    socket.on('admin_notifications_backfill', handleBackfill);
    socket.on('admin_notification_created', handleCreated);
    socket.on('admin_notifications_read', handleRead);

    return () => {
      socket.off('admin_notifications_backfill', handleBackfill);
      socket.off('admin_notification_created', handleCreated);
      socket.off('admin_notifications_read', handleRead);
    };
  }, [socket, isConnected, canViewLeaveRequests]);

  const markVisibleAsRead = () => {
    if (!socket) {
      return;
    }

    const unreadIds = notifications.filter(item => !item.readAt).map(item => item.id);
    if (unreadIds.length === 0) {
      return;
    }

    socket.emit('mark_admin_notifications_read', { notificationIds: unreadIds });
  };

  return (
    <AdminNotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        isInitialized,
        markVisibleAsRead,
      }}
    >
      {children}
    </AdminNotificationContext.Provider>
  );
}

export function useAdminNotifications() {
  const context = useContext(AdminNotificationContext);
  if (context === undefined) {
    throw new Error('useAdminNotifications must be used within AdminNotificationProvider');
  }
  return context;
}
