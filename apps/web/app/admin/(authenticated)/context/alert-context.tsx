'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { Alert, Shift, ShiftType, Site, Attendance } from '@prisma/client';
import { EmployeeWithRelations } from '@repo/database';
import { Serialized } from '@/lib/utils';
import { useSession } from './session-context';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { useSocket } from '@/components/socket-provider';

// --- Types ---

type EmployeeWithOptionalRelations = Serialized<EmployeeWithRelations>;
type ShiftTypeWithOptionalRelations = Serialized<ShiftType>;
type SiteWithOptionalRelations = Serialized<Site>;
type AttendanceWithOptionalRelations = Serialized<Attendance>;

type ShiftWithOptionalRelations = Serialized<Shift> & {
  employee?: EmployeeWithOptionalRelations | null;
  shiftType?: ShiftTypeWithOptionalRelations;
};

export type ActiveShiftInDashboard = Serialized<Shift> & {
  employee: EmployeeWithOptionalRelations | null;
  shiftType: ShiftTypeWithOptionalRelations;
  attendance?: AttendanceWithOptionalRelations | null;
};

export type ActiveSiteData = {
  site: SiteWithOptionalRelations;
  shifts: ActiveShiftInDashboard[];
};

export type UpcomingShift = Serialized<Shift> & {
  employee: EmployeeWithOptionalRelations | null;
  shiftType: ShiftTypeWithOptionalRelations;
  site: SiteWithOptionalRelations;
};

export type AlertWithRelations = Serialized<Alert> & {
  site?: SiteWithOptionalRelations;
  shift?: ShiftWithOptionalRelations;
  status?: string;
};

export type SSEAlertData =
  | {
      type: 'alert_created' | 'alert_updated' | 'alert_attention';
      alert: AlertWithRelations;
    }
  | { type: 'alert_deleted' | 'alert_cleared'; alertId: string }
  | AlertWithRelations;

interface AlertContextType {
  alerts: AlertWithRelations[];
  activeSites: ActiveSiteData[];
  upcomingShifts: UpcomingShift[];
  connectionStatus: string;
  lastAlertEvent: SSEAlertData | null;
  isMuted: boolean;
  isInitialized: boolean;
  setIsMuted: (muted: boolean) => void;
  acknowledgeAlert: (alertId: string) => void;
}

const AlertContext = createContext<AlertContextType | undefined>(undefined);

export function AlertProvider({ children }: { children: React.ReactNode }) {
  const { hasPermission, userId } = useSession();
  const { socket, isConnected } = useSocket();

  const [alerts, setAlerts] = useState<AlertWithRelations[]>([]);
  const [activeSites, setActiveSites] = useState<ActiveSiteData[]>([]);
  const [upcomingShifts, setUpcomingShifts] = useState<UpcomingShift[]>([]);
  const [lastAlertEvent, setLastAlertEvent] = useState<SSEAlertData | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Refactored Mute State: Initialize directly from local storage
  const [isMuted, setIsMuted] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const savedMuted = localStorage.getItem('alerts_muted');
    const savedUserId = localStorage.getItem('alerts_muted_user_id');
    // Basic sync: if user matches or no user was saved, try to load
    return savedMuted === 'true' && (!savedUserId || savedUserId === userId);
  });

  // Sync isMuted changes to localStorage
  useEffect(() => {
    if (!userId) return;
    localStorage.setItem('alerts_muted', isMuted.toString());
    localStorage.setItem('alerts_muted_user_id', userId);
  }, [isMuted, userId]);

  const canViewAlerts = hasPermission(PERMISSIONS.ALERTS.VIEW);

  // Derive connection status directly from reactive state
  const connectionStatus = !canViewAlerts ? 'Disabled' : isConnected ? 'Connected' : 'Reconnecting...';

  useEffect(() => {
    if (!canViewAlerts || !socket) return;

    if (isConnected) {
      // Request initial data upon connection
      socket.emit('request_dashboard_backfill', {});
    }

    const handleBackfill = (data: { alerts: AlertWithRelations[] }) => {
      setAlerts(data.alerts.filter(alert => !alert.resolvedAt));
      setIsInitialized(true);
    };

    const handleActiveShifts = (data: ActiveSiteData[]) => {
      setActiveSites(data);
      setIsInitialized(true);
    };

    const handleUpcomingShifts = (data: UpcomingShift[]) => {
      setUpcomingShifts(data);
      setIsInitialized(true);
    };

    const handleAlert = (data: SSEAlertData) => {
      setLastAlertEvent(data); // Expose raw event to subscribers
      if ('type' in data && data.type === 'alert_created') {
        setAlerts(prev => {
          const filteredPrev = prev.filter(a => {
            if (data.alert.shift?.id && a.shift?.id === data.alert.shift.id && a.status === 'need_attention') {
              return false;
            }
            return a.id !== data.alert.id && !data.alert.resolvedAt;
          });
          return [data.alert, ...filteredPrev];
        });
      } else if ('type' in data && data.type === 'alert_attention') {
        setAlerts(prev => {
          if (prev.find(a => a.id === data.alert.id)) return prev;
          return [{ ...data.alert, status: 'need_attention' } as AlertWithRelations, ...prev];
        });
      } else if ('type' in data && data.type === 'alert_updated') {
        setAlerts(prev => {
          if (data.alert.resolvedAt) {
            return prev.filter(a => a.id !== data.alert.id);
          }
          return prev.map(a => (a.id === data.alert.id ? data.alert : a));
        });
      } else if ('type' in data && data.type === 'alert_cleared') {
        setAlerts(prev => prev.filter(a => a.id !== data.alertId));
      } else if ('id' in data && !('type' in data)) {
        // Fallback for raw alert object
        if (!data.resolvedAt) {
          setAlerts(prev => [data as AlertWithRelations, ...prev]);
        }
      }
    };

    socket.on('dashboard:backfill', handleBackfill);
    socket.on('active_shifts', handleActiveShifts);
    socket.on('upcoming_shifts', handleUpcomingShifts);
    socket.on('alert', handleAlert);

    return () => {
      socket.off('dashboard:backfill', handleBackfill);
      socket.off('active_shifts', handleActiveShifts);
      socket.off('upcoming_shifts', handleUpcomingShifts);
      socket.off('alert', handleAlert);
    };
  }, [canViewAlerts, socket, isConnected]);

  const acknowledgeAlert = (alertId: string) => {
    setAlerts(prev =>
      prev.map(a => {
        if (a.id !== alertId) return a;
        return {
          ...a,
          acknowledgedAt: new Date().toISOString(),
        };
      })
    );
  };

  return (
    <AlertContext.Provider
      value={{
        alerts,
        activeSites,
        upcomingShifts,
        connectionStatus,
        lastAlertEvent,
        isMuted,
        isInitialized,
        setIsMuted,
        acknowledgeAlert,
      }}
    >
      {children}
    </AlertContext.Provider>
  );
}

export function useAlerts() {
  const context = useContext(AlertContext);
  if (context === undefined) {
    throw new Error('useAlerts must be used within an AlertProvider');
  }
  return context;
}
