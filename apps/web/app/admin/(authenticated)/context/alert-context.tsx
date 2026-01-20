'use client';

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Alert, Shift, ShiftType, Site, Attendance } from '@prisma/client';
import { ExtendedEmployee } from '@repo/database';
import { Serialized } from '@/lib/utils';
import { useSession } from './session-context';
import { PERMISSIONS } from '@/lib/auth/permissions';

// --- Types ---

type EmployeeWithOptionalRelations = Serialized<ExtendedEmployee>;
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
  setIsMuted: (muted: boolean) => void;
  acknowledgeAlert: (alertId: string) => void;
}

const AlertContext = createContext<AlertContextType | undefined>(undefined);

export function AlertProvider({ children }: { children: React.ReactNode }) {
  const [alerts, setAlerts] = useState<AlertWithRelations[]>([]);
  const [activeSites, setActiveSites] = useState<ActiveSiteData[]>([]);
  const [upcomingShifts, setUpcomingShifts] = useState<UpcomingShift[]>([]);
  const [connectionStatus, setConnectionStatus] = useState('Connecting...');
  const [lastAlertEvent, setLastAlertEvent] = useState<SSEAlertData | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const { hasPermission, userId } = useSession();
  const isInitialized = useRef(false);

  const canViewAlerts = hasPermission(PERMISSIONS.ALERTS.VIEW);

  // Load/Sync isMuted with localStorage
  useEffect(() => {
    if (!userId) return;

    if (!isInitialized.current) {
      const savedMuted = localStorage.getItem('alerts_muted');
      const savedUserId = localStorage.getItem('alerts_muted_user_id');

      if (savedUserId === userId) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIsMuted(savedMuted === 'true');
      } else {
        // Clean upon login (new user or fresh login)
        setIsMuted(false);
        localStorage.setItem('alerts_muted', 'false');
        localStorage.setItem('alerts_muted_user_id', userId);
      }
      isInitialized.current = true;
    } else {
      localStorage.setItem('alerts_muted', isMuted.toString());
      localStorage.setItem('alerts_muted_user_id', userId);
    }
  }, [isMuted, userId]);

  useEffect(() => {
    // Only connect if the user has permission to view alerts or the dashboard
    if (!canViewAlerts) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setConnectionStatus('Disabled');
      return;
    }

    const url = '/api/admin/alerts/stream';
    const es = new EventSource(url);

    es.onopen = () => setConnectionStatus('Connected');

    es.onerror = () => {
      setConnectionStatus('Reconnecting...');
    };

    es.addEventListener('backfill', (e: MessageEvent) => {
      try {
        const data: AlertWithRelations[] = JSON.parse(e.data);
        setAlerts(data.filter(alert => !alert.resolvedAt));
      } catch (err) {
        console.error('Error parsing backfill', err);
      }
    });

    es.addEventListener('active_shifts', (e: MessageEvent) => {
      try {
        const data: ActiveSiteData[] = JSON.parse(e.data);
        setActiveSites(data);
      } catch (err) {
        console.error('Error parsing active_shifts', err);
      }
    });

    es.addEventListener('upcoming_shifts', (e: MessageEvent) => {
      try {
        const data: UpcomingShift[] = JSON.parse(e.data);
        setUpcomingShifts(data);
      } catch (err) {
        console.error('Error parsing upcoming_shifts', err);
      }
    });

    es.addEventListener('alert', (e: MessageEvent) => {
      try {
        const data: SSEAlertData = JSON.parse(e.data);
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
            return [{ ...data.alert, status: 'need_attention' }, ...prev];
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
            setAlerts(prev => [data, ...prev]);
          }
        }
      } catch (err) {
        console.error('Error parsing alert', err);
      }
    });

    eventSourceRef.current = es;

    return () => {
      es.close();
    };
  }, [canViewAlerts]);

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
