'use client';

import { createContext, useContext, useMemo } from 'react';
import { useAdminNotifications } from './admin-notification-context';
import { useAlerts } from './alert-context';
import { useSession } from './session-context';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { buildNotificationRowFromAlert, buildNotificationRowFromAdminNotification, type UnifiedNotificationItem } from '../components/notification-row';
import type { AlertWithRelations } from './alert-context';

type NotificationsDropdownContextValue = {
  items: UnifiedNotificationItem[];
  dropdownItems: UnifiedNotificationItem[];
  unreadCount: number;
  activeAlertCount: number;
  isInitialized: boolean;
  markAllAsRead: () => void;
};

const NotificationsDropdownContext = createContext<NotificationsDropdownContextValue | undefined>(undefined);

const DROPDOWN_SLICE = 30;

export function NotificationsDropdownProvider({ children }: { children: React.ReactNode }) {
  const { hasPermission } = useSession();
  const {
    notifications,
    unreadCount: notificationUnreadCount,
    isInitialized: notificationsInitialized,
    markAllRead,
  } = useAdminNotifications();
  const { alerts, isAlertsInitialized } = useAlerts();

  const canViewAlerts = hasPermission(PERMISSIONS.ALERTS.VIEW);

  const activeAlerts: AlertWithRelations[] = useMemo(
    () => (canViewAlerts ? alerts.filter(a => !a.acknowledgedAt && !a.resolvedAt && a.status !== 'need_attention') : []),
    [alerts, canViewAlerts]
  );

  const items = useMemo(() => {
    const notificationItems: UnifiedNotificationItem[] = notifications.map(buildNotificationRowFromAdminNotification);

    const alertItems: UnifiedNotificationItem[] = activeAlerts.map(a =>
      buildNotificationRowFromAlert(a, '/admin/alerts')
    );

    const merged = [...notificationItems, ...alertItems].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return merged;
  }, [notifications, activeAlerts]);

  const dropdownItems = useMemo(() => items.slice(0, DROPDOWN_SLICE), [items]);

  const isInitialized = notificationsInitialized && isAlertsInitialized;

  return (
    <NotificationsDropdownContext.Provider
      value={{
        items,
        dropdownItems,
        unreadCount: notificationUnreadCount + activeAlerts.length,
        activeAlertCount: activeAlerts.length,
        isInitialized,
        markAllAsRead: markAllRead,
      }}
    >
      {children}
    </NotificationsDropdownContext.Provider>
  );
}

export function useNotificationsDropdown() {
  const context = useContext(NotificationsDropdownContext);
  if (!context) {
    throw new Error('useNotificationsDropdown must be used within NotificationsDropdownProvider');
  }
  return context;
}
