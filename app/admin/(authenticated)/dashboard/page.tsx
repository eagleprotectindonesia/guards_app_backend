'use client';

import { useState, useEffect, useRef } from 'react';
import { Site, Guard, Shift, ShiftType, Alert } from '@prisma/client';
import { Serialized } from '@/lib/utils';
import AlertMap from '../components/alert-map';
import AlertItem from '../components/alert-item';
import AlertResolutionModal from '../components/alert-resolution-modal';
import Select from '../components/select'; // Added import for custom Select component
import AlarmInterface from './components/alarm-interface';

type GuardWithOptionalRelations = Serialized<Guard>;
type ShiftTypeWithOptionalRelations = Serialized<ShiftType>;
type SiteWithOptionalRelations = Serialized<Site>;

type ShiftWithOptionalRelations = Serialized<Shift> & {
  guard?: GuardWithOptionalRelations | null;
  shiftType?: ShiftTypeWithOptionalRelations;
};

type ActiveShiftInDashboard = Serialized<Shift> & {
  guard: GuardWithOptionalRelations | null;
  shiftType: ShiftTypeWithOptionalRelations;
};

type ActiveSiteData = {
  site: SiteWithOptionalRelations;
  shifts: ActiveShiftInDashboard[];
};

type AlertWithRelations = Serialized<Alert> & {
  site?: SiteWithOptionalRelations;
  shift?: ShiftWithOptionalRelations;
  status?: string;
};

type SSEAlertData =
  | {
      type: 'alert_created' | 'alert_updated' | 'alert_attention';
      alert: AlertWithRelations;
    }
  | AlertWithRelations;

export default function AdminDashboard() {
  const [sites, setSites] = useState<SiteWithOptionalRelations[]>([]);
  const [activeSites, setActiveSites] = useState<ActiveSiteData[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState(''); // Empty string = All Sites
  const [alerts, setAlerts] = useState<AlertWithRelations[]>([]);
  const [connectionStatus, setConnectionStatus] = useState('Disconnected');
  const eventSourceRef = useRef<EventSource | null>(null);

  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);

  // Fetch all sites for the dropdown (static list)
  useEffect(() => {
    fetch('/api/admin/sites')
      .then(res => res.json())
      .then((data: SiteWithOptionalRelations[]) => {
        if (Array.isArray(data)) setSites(data);
      });
  }, []);

  // Connect SSE
  useEffect(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    // Construct URL: if selectedSiteId is empty, it hits the global stream
    const url = selectedSiteId ? `/api/admin/alerts/stream?siteId=${selectedSiteId}` : '/api/admin/alerts/stream';

    const es = new EventSource(url);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConnectionStatus('Connecting...');

    es.onopen = () => setConnectionStatus('Connected');

    es.onerror = () => {
      setConnectionStatus('Reconnecting...');
      // Browser native EventSource automatically retries on error,
      // but we update UI to reflect potential temporary disconnect.
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
        // Expecting array of { site: {...}, shifts: [...] }
        setActiveSites(data);
      } catch (err) {
        console.error('Error parsing active_shifts', err);
      }
    });

    es.addEventListener('alert', (e: MessageEvent) => {
      try {
        const data: SSEAlertData = JSON.parse(e.data);

        if ('type' in data && data.type === 'alert_created') {
          setAlerts(prev => {
            // Remove any existing 'need_attention' alerts for the same shift
            // and filter out the new alert if it's already present or resolved.
            const filteredPrev = prev.filter(a => {
              if (data.alert.shift?.id && a.shift?.id === data.alert.shift.id && a.status === 'need_attention') {
                return false; // Remove the old 'need_attention' alert for this shift
              }
              return a.id !== data.alert.id && !data.alert.resolvedAt; // Avoid adding duplicates or resolved alerts
            });
            return [data.alert, ...filteredPrev];
          });
        } else if ('type' in data && data.type === 'alert_attention') {
          setAlerts(prev => {
            // Avoid duplicates
            if (prev.find(a => a.id === data.alert.id)) return prev;
            return [{ ...data.alert, status: 'need_attention' }, ...prev];
          });
        } else if ('type' in data && data.type === 'alert_updated') {
          setAlerts(prev => {
            // If the updated alert is resolved, remove it from the list
            if (data.alert.resolvedAt) {
              return prev.filter(a => a.id !== data.alert.id);
            }
            // Otherwise, update the alert
            return prev.map(a => (a.id === data.alert.id ? data.alert : a));
          });
        } else if ('id' in data && !data.resolvedAt) {
          // Fallback for raw alert object (legacy?) - only add if not resolved
          setAlerts(prev => [data, ...prev]);
        }
      } catch (err) {
        console.error('Error parsing alert', err);
      }
    });

    eventSourceRef.current = es;

    return () => {
      es.close();
    };
  }, [selectedSiteId]);

  const handleResolve = (alertId: string) => {
    setSelectedAlertId(alertId);
  };

  const handleConfirmResolution = async (outcome: 'resolve' | 'forgive', note: string) => {
    if (!selectedAlertId) return;

    try {
      const body = { outcome, note };
      await fetch(`/api/admin/alerts/${selectedAlertId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      // Optimistic Update: remove the resolved alert from the list
      setAlerts(prev => prev.filter(a => a.id !== selectedAlertId));

      setSelectedAlertId(null);
    } catch (err) {
      console.error(err);
    }
  };

  const handleAcknowledge = async (alertId: string) => {
    try {
      await fetch(`/api/admin/alerts/${alertId}/acknowledge`, { method: 'POST' });
      // Optimistic update: update local state immediately
      setAlerts(prev =>
        prev.map(a => {
          if (a.id !== alertId) return a;
          return {
            ...a,
            acknowledgedAt: new Date().toISOString(),
          };
        })
      );
    } catch (err) {
      console.error(err);
    }
  };

  const siteOptions = [
    { value: '', label: 'All Sites' },
    ...sites.map(s => ({ value: s.id, label: s.name })).slice(0, 8),
  ];

  return (
    <div className="h-full flex flex-col">
      <header className="mb-6 flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Live Dashboard</h1>
          <p className="text-sm text-gray-500">Real-time monitoring of guards and alerts</p>
        </div>
        <div className="flex items-center gap-4">
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border ${
              connectionStatus === 'Connected'
                ? 'bg-green-50 text-green-700 border-green-200'
                : 'bg-amber-50 text-amber-700 border-amber-200'
            }`}
          >
            <div
              className={`w-2 h-2 rounded-full ${
                connectionStatus === 'Connected' ? 'bg-green-500 animate-pulse' : 'bg-amber-500'
              }`}
            />
            {connectionStatus}
          </div>

          <Select
            options={siteOptions}
            value={siteOptions.find(opt => opt.value === selectedSiteId) || null}
            onChange={option => setSelectedSiteId(option?.value || '')}
            placeholder="All Sites"
            isClearable={false}
          />
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 flex-1">
        {/* Left Column: Active Sites / Stats */}
        <div className="space-y-6">
          {/* Stats Card */}
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">Overview</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-red-50 p-3 rounded-lg border border-red-100">
                <div className="text-2xl font-bold text-red-700">{alerts.length}</div>
                <div className="text-xs text-red-600 font-medium">Active Alerts</div>
              </div>
              <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                <div className="text-2xl font-bold text-blue-700">{activeSites.length}</div>
                <div className="text-xs text-blue-600 font-medium">Active Sites</div>
              </div>
            </div>
          </div>

          {/* Active Sites List */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-4 border-b border-gray-100 bg-gray-50/50">
              <h3 className="font-semibold text-gray-900">Active Shifts</h3>
            </div>
            <div className="divide-y divide-gray-100 max-h-[calc(100vh-400px)] overflow-y-auto">
              {activeSites.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-sm text-gray-500">No active shifts right now.</p>
                </div>
              ) : (
                activeSites.map(({ site, shifts }) => (
                  <div key={site.id} className="p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-gray-900">{site.name}</span>
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                        {shifts.length} Active
                      </span>
                    </div>
                    <div className="space-y-2">
                      {shifts.map((shift: ActiveShiftInDashboard) => (
                        <div key={shift.id} className="text-xs text-gray-600 flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-green-400"></div>
                          <span className="truncate">
                            {shift.guard?.name || 'Unassigned'}
                            <span className="text-gray-400"> ({shift.shiftType?.name})</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Main Column: Alerts Feed */}
        <div className="col-span-1 lg:col-span-3 space-y-4">
          <AlarmInterface alerts={alerts} />

          {/* <AlertMap alerts={alerts} /> */}

          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">Alert Feed</h2>
            {selectedSiteId && (
              <button onClick={() => setSelectedSiteId('')} className="text-sm text-blue-600 hover:text-blue-800">
                View All Sites
              </button>
            )}
          </div>

          {alerts.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
              <div className="mx-auto w-16 h-16 bg-green-50 text-green-500 rounded-full flex items-center justify-center mb-4">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900">All Clear</h3>
              <p className="text-gray-500">No active alerts at the moment.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {alerts.map(alert => (
                <AlertItem key={alert.id} alert={alert} onAcknowledge={handleAcknowledge} onResolve={handleResolve} />
              ))}
            </div>
          )}
        </div>
      </div>

      <AlertResolutionModal
        isOpen={!!selectedAlertId}
        onClose={() => setSelectedAlertId(null)}
        onConfirm={handleConfirmResolution}
      />
    </div>
  );
}
