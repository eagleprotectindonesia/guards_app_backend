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
  markAllRead: () => void;
  markReadById: (id: string) => void;
};

const AdminNotificationContext = createContext<AdminNotificationContextType | undefined>(undefined);

const BACKFILL_LIMIT = 20;

export function AdminNotificationProvider({ children }: { children: React.ReactNode }) {
  const { socket, isConnected } = useSocket();
  const { hasPermission } = useSession();
  const canViewLeaveRequests = hasPermission(PERMISSIONS.LEAVE_REQUESTS.VIEW);
  const canViewTickets = hasPermission(PERMISSIONS.TICKETS.VIEW);
  const canViewAdminNotifications = canViewLeaveRequests || canViewTickets || true;

  const [notifications, setNotifications] = useState<AdminNotificationEventItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [hasReceivedBackfill, setHasReceivedBackfill] = useState(false);

  const isInitialized = !canViewAdminNotifications || hasReceivedBackfill;

  useEffect(() => {
    if (!socket || !canViewAdminNotifications) {
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
  }, [socket, isConnected, canViewAdminNotifications]);

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

  const markAllRead = markVisibleAsRead;

  const markReadById = (id: string) => {
    setNotifications(prev =>
      prev.map(item => (item.id === id && !item.readAt ? { ...item, readAt: new Date().toISOString() } : item))
    );
    setUnreadCount(prev => Math.max(0, prev - 1));
    socket?.emit('mark_admin_notifications_read', { notificationIds: [id] });
  };

  return (
    <AdminNotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        isInitialized,
        markVisibleAsRead,
        markAllRead,
        markReadById,
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
