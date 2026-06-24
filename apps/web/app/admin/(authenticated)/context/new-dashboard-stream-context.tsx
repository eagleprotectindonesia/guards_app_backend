'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Alert, Shift, ShiftType, Site } from '@prisma/client';
import type { EmployeeWithRelations } from '@repo/database';
import type { Serialized } from '@/lib/server-utils';
import { useSocket } from '@/components/socket-provider';
import { useSession } from './session-context';
import { PERMISSIONS } from '@/lib/auth/permissions';

const CRITICAL_ALERT_LIMIT = 4;
const LIVE_ACTIVITY_LIMIT = 4;

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
  liveActivityFeed: SliceState<NewDashboardLiveActivityItem[]>;
  totalIncidents: SliceState<TotalIncidentsData>;
  totalAttendance: SliceState<TotalAttendanceData>;
  topSitesActivity: SliceState<TopSitesActivityData>;
  refetchCriticalAlerts: () => void;
  refetchShiftOverview: () => void;
  refetchLiveActivityFeed: () => void;
  refetchTotalIncidents: () => void;
  refetchTotalAttendance: () => void;
  refetchTopSitesActivity: () => void;
};

const NewDashboardStreamContext = createContext<NewDashboardStreamContextType | undefined>(undefined);

type ShiftOverviewData = {
  dateKey: string;
  onDuty: number;
  onDutySiteGuards: number;
  onDutyPatrol: number;
  upcoming: number;
  completed: number;
  absent: number;
  absentSiteGuards: number;
  absentPatrol: number;
  carryoverOnDuty: number;
  total: number;
  lastUpdatedAt: string;
};

export type NewDashboardLiveActivityItem = {
  id: string;
  kind: 'attendance' | 'checkin';
  occurredAt: string;
  guardName: string;
  siteName: string;
  status: string;
  shiftId: string;
  employeeId: string | null;
};

type TotalIncidentsData = {
  dateKey: string;
  total: number;
  attendance: number;
  checkin: number;
  yesterdayTotal: number;
  deltaVsYesterday: number;
  lastUpdatedAt: string;
};

type TotalAttendanceData = {
  dateKey: string;
  attendanceRate: number;
  attendedCount: number;
  eligibleCount: number;
  attendanceRateSiteGuards: number;
  attendanceRatePatrol: number;
  yesterdayAttendanceRate: number;
  deltaVsYesterday: number;
  lastUpdatedAt: string;
};

type TopSitesActivityData = {
  windowStart: string;
  windowEnd: string;
  sites: {
    siteId: string;
    siteName: string;
    total: number;
    guard: number;
    onsite: number;
    lastAlertAt: string;
  }[];
  lastUpdatedAt: string;
};

function isIncidentAlert(alert: NewDashboardAlert): boolean {
  return alert.severity === 'critical' && (alert.reason === 'missed_attendance' || alert.reason === 'missed_checkin');
}

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
        onDutySiteGuards: 0,
        onDutyPatrol: 0,
        upcoming: 0,
        completed: 0,
        absent: 0,
        absentSiteGuards: 0,
        absentPatrol: 0,
        carryoverOnDuty: 0,
        total: 0,
        lastUpdatedAt: '',
      },
  });
  const [liveActivityFeed, setLiveActivityFeed] = useState<SliceState<NewDashboardLiveActivityItem[]>>({
    status: 'idle',
    data: [],
  });
  const [totalIncidents, setTotalIncidents] = useState<SliceState<TotalIncidentsData>>({
    status: 'idle',
    data: {
      dateKey: '',
      total: 0,
      attendance: 0,
      checkin: 0,
      yesterdayTotal: 0,
      deltaVsYesterday: 0,
      lastUpdatedAt: '',
    },
  });
  const [totalAttendance, setTotalAttendance] = useState<SliceState<TotalAttendanceData>>({
    status: 'idle',
    data: {
      dateKey: '',
      attendanceRate: 0,
      attendedCount: 0,
      eligibleCount: 0,
      attendanceRateSiteGuards: 0,
      attendanceRatePatrol: 0,
      yesterdayAttendanceRate: 0,
      deltaVsYesterday: 0,
      lastUpdatedAt: '',
    },
  });
  const [topSitesActivity, setTopSitesActivity] = useState<SliceState<TopSitesActivityData>>({
    status: 'idle',
    data: {
      windowStart: '',
      windowEnd: '',
      sites: [],
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

  const emitLiveActivityFeedRequest = useCallback(() => {
    if (!socket || !canViewAlerts) return;
    socket.emit('request_new_dashboard_backfill', { cards: ['live_activity_feed'] });
  }, [socket, canViewAlerts]);

  const emitTotalIncidentsRequest = useCallback(() => {
    if (!socket || !canViewAlerts) return;
    socket.emit('request_new_dashboard_backfill', { cards: ['total_incidents'] });
  }, [socket, canViewAlerts]);

  const emitTotalAttendanceRequest = useCallback(() => {
    if (!socket || !canViewAlerts) return;
    socket.emit('request_new_dashboard_backfill', { cards: ['total_attendance'] });
  }, [socket, canViewAlerts]);

  const emitTopSitesActivityRequest = useCallback(() => {
    if (!socket || !canViewAlerts) return;
    socket.emit('request_new_dashboard_backfill', { cards: ['top_sites_activity'] });
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

  const refetchLiveActivityFeed = useCallback(() => {
    if (!socket || !canViewAlerts) return;

    setLiveActivityFeed(prev => ({
      ...prev,
      status: prev.data.length > 0 ? 'ready' : 'loading',
      error: undefined,
    }));

    socket.emit('request_new_dashboard_backfill', { cards: ['live_activity_feed'] });
  }, [socket, canViewAlerts]);

  const refetchTotalIncidents = useCallback(() => {
    if (!socket || !canViewAlerts) return;

    setTotalIncidents(prev => ({
      ...prev,
      status: prev.data.dateKey ? 'ready' : 'loading',
      error: undefined,
    }));

    socket.emit('request_new_dashboard_backfill', { cards: ['total_incidents'] });
  }, [socket, canViewAlerts]);

  const refetchTotalAttendance = useCallback(() => {
    if (!socket || !canViewAlerts) return;

    setTotalAttendance(prev => ({
      ...prev,
      status: prev.data.dateKey ? 'ready' : 'loading',
      error: undefined,
    }));

    socket.emit('request_new_dashboard_backfill', { cards: ['total_attendance'] });
  }, [socket, canViewAlerts]);

  const refetchTopSitesActivity = useCallback(() => {
    if (!socket || !canViewAlerts) return;

    setTopSitesActivity(prev => ({
      ...prev,
      status: prev.data.windowEnd ? 'ready' : 'loading',
      error: undefined,
    }));

    socket.emit('request_new_dashboard_backfill', { cards: ['top_sites_activity'] });
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

      if ('type' in event && event.type === 'alert_created' && isIncidentAlert(event.alert)) {
        emitTotalIncidentsRequest();
        emitTopSitesActivityRequest();
        return;
      }

      if ('id' in event && !('type' in event) && isIncidentAlert(event)) {
        emitTotalIncidentsRequest();
        emitTopSitesActivityRequest();
      }

      const alertReason =
        'type' in event && 'alert' in event ? event.alert.reason : 'reason' in event ? event.reason : null;
      if (alertReason === 'missed_attendance') {
        emitTotalAttendanceRequest();
      }
    };

    const handleShiftOverviewBackfill = (payload: ShiftOverviewData) => {
      setShiftOverview({
        status: 'ready',
        data: payload,
        lastUpdatedAt: new Date().toISOString(),
      });
    };

    const handleLiveActivityBackfill = (payload: { items: NewDashboardLiveActivityItem[] }) => {
      setLiveActivityFeed({
        status: 'ready',
        data: payload.items.slice(0, LIVE_ACTIVITY_LIMIT),
        lastUpdatedAt: new Date().toISOString(),
      });
    };

    const handleLiveActivityEvent = (payload: { item: NewDashboardLiveActivityItem }) => {
      setLiveActivityFeed(prev => {
        const merged = [payload.item, ...prev.data.filter(item => item.id !== payload.item.id)].slice(
          0,
          LIVE_ACTIVITY_LIMIT
        );
        return {
          ...prev,
          status: 'ready',
          data: merged,
          lastUpdatedAt: new Date().toISOString(),
        };
      });

      if (payload.item.kind === 'attendance') {
        emitTotalAttendanceRequest();
      }
    };

    const handleTotalIncidentsBackfill = (payload: TotalIncidentsData) => {
      setTotalIncidents({
        status: 'ready',
        data: payload,
        lastUpdatedAt: new Date().toISOString(),
      });
    };

    const handleTotalAttendanceBackfill = (payload: TotalAttendanceData) => {
      setTotalAttendance({
        status: 'ready',
        data: payload,
        lastUpdatedAt: new Date().toISOString(),
      });
    };

    const handleTopSitesActivityBackfill = (payload: TopSitesActivityData) => {
      setTopSitesActivity({
        status: 'ready',
        data: payload,
        lastUpdatedAt: new Date().toISOString(),
      });
    };

    socket.on('new_dashboard:critical_alerts', handleCriticalAlertsBackfill);
    socket.on('new_dashboard:shift_overview', handleShiftOverviewBackfill);
    socket.on('new_dashboard:live_activity_feed', handleLiveActivityBackfill);
    socket.on('new_dashboard:live_activity_event', handleLiveActivityEvent);
    socket.on('new_dashboard:total_incidents', handleTotalIncidentsBackfill);
    socket.on('new_dashboard:total_attendance', handleTotalAttendanceBackfill);
    socket.on('new_dashboard:top_sites_activity', handleTopSitesActivityBackfill);
    socket.on('alert', handleAlertEvent);
    socket.on('upcoming_shifts', emitShiftOverviewRequest);

    return () => {
      socket.off('new_dashboard:critical_alerts', handleCriticalAlertsBackfill);
      socket.off('new_dashboard:shift_overview', handleShiftOverviewBackfill);
      socket.off('new_dashboard:live_activity_feed', handleLiveActivityBackfill);
      socket.off('new_dashboard:live_activity_event', handleLiveActivityEvent);
      socket.off('new_dashboard:total_incidents', handleTotalIncidentsBackfill);
      socket.off('new_dashboard:total_attendance', handleTotalAttendanceBackfill);
      socket.off('new_dashboard:top_sites_activity', handleTopSitesActivityBackfill);
      socket.off('alert', handleAlertEvent);
      socket.off('upcoming_shifts', emitShiftOverviewRequest);
    };
  }, [
    socket,
    emitShiftOverviewRequest,
    emitTotalIncidentsRequest,
    emitTotalAttendanceRequest,
    emitTopSitesActivityRequest,
  ]);

  useEffect(() => {
    if (!canViewAlerts || !isConnected) {
      return;
    }

    emitCriticalAlertsRequest();
    emitShiftOverviewRequest();
    emitLiveActivityFeedRequest();
    emitTotalIncidentsRequest();
    emitTotalAttendanceRequest();
    emitTopSitesActivityRequest();
  }, [
    canViewAlerts,
    isConnected,
    emitCriticalAlertsRequest,
    emitShiftOverviewRequest,
    emitLiveActivityFeedRequest,
    emitTotalIncidentsRequest,
    emitTotalAttendanceRequest,
    emitTopSitesActivityRequest,
  ]);

  const value: NewDashboardStreamContextType = {
    criticalAlerts: canViewAlerts ? criticalAlerts : { status: 'ready', data: [] },
    shiftOverview: canViewAlerts
      ? shiftOverview
      : {
          status: 'ready',
          data: {
            dateKey: '',
            onDuty: 0,
            onDutySiteGuards: 0,
            onDutyPatrol: 0,
            upcoming: 0,
            completed: 0,
            absent: 0,
            absentSiteGuards: 0,
            absentPatrol: 0,
            carryoverOnDuty: 0,
            total: 0,
            lastUpdatedAt: '',
          },
        },
    liveActivityFeed: canViewAlerts ? liveActivityFeed : { status: 'ready', data: [] },
    totalIncidents: canViewAlerts
      ? totalIncidents
      : {
          status: 'ready',
          data: {
            dateKey: '',
            total: 0,
            attendance: 0,
            checkin: 0,
            yesterdayTotal: 0,
            deltaVsYesterday: 0,
            lastUpdatedAt: '',
          },
        },
    totalAttendance: canViewAlerts
      ? totalAttendance
      : {
          status: 'ready',
          data: {
            dateKey: '',
            attendanceRate: 0,
            attendedCount: 0,
            eligibleCount: 0,
            attendanceRateSiteGuards: 0,
            attendanceRatePatrol: 0,
            yesterdayAttendanceRate: 0,
            deltaVsYesterday: 0,
            lastUpdatedAt: '',
          },
        },
    topSitesActivity: canViewAlerts
      ? topSitesActivity
      : {
          status: 'ready',
          data: {
            windowStart: '',
            windowEnd: '',
            sites: [],
            lastUpdatedAt: '',
          },
        },
    refetchCriticalAlerts,
    refetchShiftOverview,
    refetchLiveActivityFeed,
    refetchTotalIncidents,
    refetchTotalAttendance,
    refetchTopSitesActivity,
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
