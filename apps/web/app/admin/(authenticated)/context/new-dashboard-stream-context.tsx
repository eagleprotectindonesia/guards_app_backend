'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Alert, Shift, ShiftType, Site } from '@prisma/client';
import type { EmployeeWithRelations } from '@repo/database';
import type { Serialized } from '@/lib/server-utils';
import { useSocket } from '@/components/socket-provider';
import { useSession } from './session-context';
import { PERMISSIONS } from '@/lib/auth/permissions';

const CRITICAL_ALERT_LIMIT = 4;

type SliceStatus = 'idle' | 'loading' | 'ready' | 'error';

type EmployeeWithOptionalRelations = Serialized<EmployeeWithRelations>;
type ShiftTypeWithOptionalRelations = Serialized<ShiftType>;
type SiteWithOptionalRelations = Serialized<Site>;

type ShiftWithOptionalRelations = Serialized<Shift> & {
  employee?: EmployeeWithOptionalRelations | null;
  shiftType?: ShiftTypeWithOptionalRelations;
};

export type NewDashboardAlert = Serialized<Alert> & {
  site?: SiteWithOptionalRelations;
  shift?: ShiftWithOptionalRelations;
  status?: string;
};

type AlertEventPayload =
  | {
      type: 'alert_created' | 'alert_updated' | 'alert_attention';
      alert: NewDashboardAlert;
    }
  | { type: 'alert_deleted' | 'alert_cleared'; alertId: string }
  | NewDashboardAlert;

type SliceState<T> = {
  status: SliceStatus;
  data: T;
  error?: string;
  lastUpdatedAt?: string;
};

type NewDashboardStreamContextType = {
  criticalAlerts: SliceState<NewDashboardAlert[]>;
  shiftOverview: SliceState<ShiftOverviewData>;
  refetchCriticalAlerts: () => void;
  refetchShiftOverview: () => void;
};

const NewDashboardStreamContext = createContext<NewDashboardStreamContextType | undefined>(undefined);

type ShiftOverviewData = {
  dateKey: string;
  onDuty: number;
  upcoming: number;
  completed: number;
  absent: number;
  carryoverOnDuty: number;
  total: number;
  lastUpdatedAt: string;
};

function severityRank(alert: NewDashboardAlert): number {
  return alert.severity === 'critical' ? 2 : 1;
}

function sortAlerts(alerts: NewDashboardAlert[]): NewDashboardAlert[] {
  return [...alerts].sort((a, b) => {
    const severityDiff = severityRank(b) - severityRank(a);
    if (severityDiff !== 0) return severityDiff;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

function normalizeAlerts(alerts: NewDashboardAlert[]): NewDashboardAlert[] {
  const merged = new Map<string, NewDashboardAlert>();
  for (const alert of alerts) {
    if (alert.resolvedAt) continue;
    const existing = merged.get(alert.id);
    if (!existing || new Date(alert.createdAt).getTime() >= new Date(existing.createdAt).getTime()) {
      merged.set(alert.id, alert);
    }
  }

  return sortAlerts(Array.from(merged.values())).slice(0, CRITICAL_ALERT_LIMIT);
}

function reduceAlertEvent(current: NewDashboardAlert[], event: AlertEventPayload): NewDashboardAlert[] {
  if ('type' in event && event.type === 'alert_created') {
    const filtered = current.filter(a => {
      if (event.alert.shift?.id && a.shift?.id === event.alert.shift.id && a.status === 'need_attention') {
        return false;
      }
      return a.id !== event.alert.id;
    });
    return normalizeAlerts([event.alert, ...filtered]);
  }

  if ('type' in event && event.type === 'alert_attention') {
    if (current.some(a => a.id === event.alert.id)) {
      return current;
    }
    return normalizeAlerts([{ ...event.alert, status: 'need_attention' }, ...current]);
  }

  if ('type' in event && event.type === 'alert_updated') {
    if (event.alert.resolvedAt) {
      return current.filter(a => a.id !== event.alert.id);
    }
    return normalizeAlerts([event.alert, ...current.filter(a => a.id !== event.alert.id)]);
  }

  if ('type' in event && (event.type === 'alert_deleted' || event.type === 'alert_cleared')) {
    return current.filter(a => a.id !== event.alertId);
  }

  if ('id' in event && !('type' in event)) {
    if (event.resolvedAt) {
      return current.filter(a => a.id !== event.id);
    }
    return normalizeAlerts([event, ...current.filter(a => a.id !== event.id)]);
  }

  return current;
}

export function NewDashboardStreamProvider({ children }: { children: React.ReactNode }) {
  const { socket, isConnected } = useSocket();
  const { hasPermission } = useSession();

  const canViewAlerts = hasPermission(PERMISSIONS.ALERTS.VIEW);

  const [criticalAlerts, setCriticalAlerts] = useState<SliceState<NewDashboardAlert[]>>({
    status: 'idle',
    data: [],
  });
  const [shiftOverview, setShiftOverview] = useState<SliceState<ShiftOverviewData>>({
    status: 'idle',
    data: {
      dateKey: '',
      onDuty: 0,
      upcoming: 0,
      completed: 0,
      absent: 0,
      carryoverOnDuty: 0,
      total: 0,
      lastUpdatedAt: '',
    },
  });

  const emitCriticalAlertsRequest = useCallback(() => {
    if (!socket || !canViewAlerts) return;
    socket.emit('request_new_dashboard_backfill', { cards: ['critical_alerts'] });
  }, [socket, canViewAlerts]);

  const emitShiftOverviewRequest = useCallback(() => {
    if (!socket || !canViewAlerts) return;
    socket.emit('request_new_dashboard_backfill', { cards: ['shift_overview'] });
  }, [socket, canViewAlerts]);

  const refetchCriticalAlerts = useCallback(() => {
    if (!socket || !canViewAlerts) return;

    setCriticalAlerts(prev => ({
      ...prev,
      status: prev.data.length > 0 ? 'ready' : 'loading',
      error: undefined,
    }));

    socket.emit('request_new_dashboard_backfill', { cards: ['critical_alerts'] });
  }, [socket, canViewAlerts]);

  const refetchShiftOverview = useCallback(() => {
    if (!socket || !canViewAlerts) return;

    setShiftOverview(prev => ({
      ...prev,
      status: prev.data.total > 0 ? 'ready' : 'loading',
      error: undefined,
    }));

    socket.emit('request_new_dashboard_backfill', { cards: ['shift_overview'] });
  }, [socket, canViewAlerts]);

  useEffect(() => {
    if (!socket) return;

    const handleCriticalAlertsBackfill = (payload: { alerts: NewDashboardAlert[] }) => {
      setCriticalAlerts({
        status: 'ready',
        data: normalizeAlerts(payload.alerts),
        lastUpdatedAt: new Date().toISOString(),
      });
    };

    const handleAlertEvent = (event: AlertEventPayload) => {
      setCriticalAlerts(prev => ({
        ...prev,
        status: prev.status === 'idle' ? 'ready' : prev.status,
        data: reduceAlertEvent(prev.data, event),
        lastUpdatedAt: new Date().toISOString(),
      }));
    };

    const handleShiftOverviewBackfill = (payload: ShiftOverviewData) => {
      setShiftOverview({
        status: 'ready',
        data: payload,
        lastUpdatedAt: new Date().toISOString(),
      });
    };

    socket.on('new_dashboard:critical_alerts', handleCriticalAlertsBackfill);
    socket.on('new_dashboard:shift_overview', handleShiftOverviewBackfill);
    socket.on('alert', handleAlertEvent);
    socket.on('upcoming_shifts', emitShiftOverviewRequest);

    return () => {
      socket.off('new_dashboard:critical_alerts', handleCriticalAlertsBackfill);
      socket.off('new_dashboard:shift_overview', handleShiftOverviewBackfill);
      socket.off('alert', handleAlertEvent);
      socket.off('upcoming_shifts', emitShiftOverviewRequest);
    };
  }, [socket, emitShiftOverviewRequest]);

  useEffect(() => {
    if (!canViewAlerts || !isConnected) {
      return;
    }

    emitCriticalAlertsRequest();
    emitShiftOverviewRequest();
  }, [canViewAlerts, isConnected, emitCriticalAlertsRequest, emitShiftOverviewRequest]);

  const value: NewDashboardStreamContextType = {
    criticalAlerts: canViewAlerts ? criticalAlerts : { status: 'ready', data: [] },
    shiftOverview: canViewAlerts
      ? shiftOverview
      : {
          status: 'ready',
          data: {
            dateKey: '',
            onDuty: 0,
            upcoming: 0,
            completed: 0,
            absent: 0,
            carryoverOnDuty: 0,
            total: 0,
            lastUpdatedAt: '',
          },
        },
    refetchCriticalAlerts,
    refetchShiftOverview,
  };

  return <NewDashboardStreamContext.Provider value={value}>{children}</NewDashboardStreamContext.Provider>;
}

export function useNewDashboardStream() {
  const context = useContext(NewDashboardStreamContext);
  if (!context) {
    throw new Error('useNewDashboardStream must be used within a NewDashboardStreamProvider');
  }
  return context;
}
