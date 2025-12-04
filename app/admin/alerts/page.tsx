'use client';

import { useState, useEffect, useRef } from 'react';
import { Alert, Shift, Site, Guard, ShiftType } from '@prisma/client';
import { Serialized } from '@/lib/utils';

type GuardWithOptionalRelations = Serialized<Guard>;
type ShiftTypeWithOptionalRelations = Serialized<ShiftType>;
type SiteWithOptionalRelations = Serialized<Site>;

type ShiftWithOptionalRelations = Serialized<Shift> & {
  guard?: GuardWithOptionalRelations | null;
  shiftType?: ShiftTypeWithOptionalRelations;
};

type AlertWithRelations = Serialized<Alert> & {
  site?: SiteWithOptionalRelations;
  shift?: ShiftWithOptionalRelations;
};

type SSEAlertData = {
  type: 'alert_created' | 'alert_updated';
  alert: AlertWithRelations;
} | AlertWithRelations;


export default function AdminAlertsPage() {
  const [alerts, setAlerts] = useState<AlertWithRelations[]>([]);
  const [connectionStatus, setConnectionStatus] = useState('Disconnected');
  const eventSourceRef = useRef<EventSource | null>(null);

  // Connect SSE for global alerts
  useEffect(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    // Connect to the global alerts stream (no siteId parameter)
    const es = new EventSource('/api/admin/alerts/stream');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConnectionStatus('Connecting...');

    es.onopen = () => setConnectionStatus('Connected');

    es.onerror = () => {
      setConnectionStatus('Reconnecting...'); 
    };

    es.addEventListener('backfill', (e: MessageEvent) => {
      try {
        const data: AlertWithRelations[] = JSON.parse(e.data);
        setAlerts(data);
      } catch (err) {
        console.error('Error parsing backfill', err);
      }
    });

    es.addEventListener('alert', (e: MessageEvent) => {
      try {
        const data: SSEAlertData = JSON.parse(e.data);
        
        if ('type' in data && data.type === 'alert_created') {
          setAlerts(prev => {
             if (prev.find(a => a.id === data.alert.id)) return prev;
             return [data.alert, ...prev];
          });
        } else if ('type' in data && data.type === 'alert_updated') {
          setAlerts(prev => prev.map(a => (a.id === data.alert.id ? data.alert : a)));
        } else if ('id' in data) { 
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
  }, []);

  const handleAction = async (alertId: string, action: 'acknowledge' | 'resolve') => {
    try {
      await fetch(`/api/admin/alerts/${alertId}/${action}`, { method: 'POST' });
      setAlerts(prev => 
        prev.map(a => {
           if (a.id !== alertId) return a;
           return {
               ...a,
               [action === 'acknowledge' ? 'acknowledgedAt' : 'resolvedAt']: new Date().toISOString()
           };
        })
      );
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <header className="mb-6 flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <div>
            <h1 className="text-2xl font-bold text-gray-900">All Alerts</h1>
            <p className="text-sm text-gray-500">Comprehensive view of all system alerts</p>
        </div>
        <div className="flex items-center gap-4">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border ${
              connectionStatus === 'Connected' 
                ? 'bg-green-50 text-green-700 border-green-200' 
                : 'bg-amber-50 text-amber-700 border-amber-200'
            }`}>
            <div className={`w-2 h-2 rounded-full ${connectionStatus === 'Connected' ? 'bg-green-500 animate-pulse' : 'bg-amber-500'}`} />
            {connectionStatus}
          </div>
        </div>
      </header>

      <div className="flex-1">
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
                    <div
                    key={alert.id}
                    className={`group relative overflow-hidden bg-white rounded-xl shadow-sm border transition-all duration-200 hover:shadow-md ${
                        alert.resolvedAt 
                            ? 'border-gray-100 opacity-60 bg-gray-50' 
                            : alert.severity === 'critical' 
                                ? 'border-l-4 border-l-red-500 border-y-red-100 border-r-red-100' 
                                : 'border-l-4 border-l-orange-400 border-y-orange-100 border-r-orange-100'
                    }`}
                    >
                    <div className="p-5">
                        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                            <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide ${
                                        alert.severity === 'critical' ? 'bg-red-100 text-red-800' : 'bg-orange-100 text-orange-800'
                                    }`}>
                                        {alert.reason.replace('_', ' ')}
                                    </span>
                                    <span className="text-xs text-gray-400 font-mono">
                                        {new Date(alert.windowStart).toLocaleTimeString()}
                                    </span>
                                </div>
                                
                                <h4 className="text-lg font-medium text-gray-900 mb-1">
                                    {alert.site?.name}
                                </h4>
                                <div className="text-sm text-gray-600 flex flex-wrap gap-x-4 gap-y-1">
                                    <span className="flex items-center gap-1">
                                        <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                        </svg>
                                        {alert.shift?.guard?.name || 'Unassigned Guard'}
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        {alert.shift?.shiftType?.name}
                                    </span>
                                </div>
                            </div>

                            <div className="flex items-center gap-3 self-start">
                                {!alert.acknowledgedAt && !alert.resolvedAt && (
                                    <button
                                    onClick={() => handleAction(alert.id, 'acknowledge')}
                                    className="px-4 py-2 bg-white border border-blue-200 text-blue-600 text-sm font-medium rounded-lg hover:bg-blue-50 hover:border-blue-300 transition-colors focus:ring-2 focus:ring-blue-200"
                                    >
                                    Acknowledge
                                    </button>
                                )}
                                {!alert.resolvedAt && (
                                    <button
                                    onClick={() => handleAction(alert.id, 'resolve')}
                                    className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 shadow-sm shadow-green-500/30 transition-all focus:ring-2 focus:ring-green-500 focus:ring-offset-1"
                                    >
                                    Resolve
                                    </button>
                                )}
                                {alert.resolvedAt && (
                                    <span className="flex items-center gap-1.5 text-green-600 font-medium text-sm bg-green-50 px-3 py-1 rounded-full border border-green-100">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                        Resolved
                                    </span>
                                )}
                                {alert.acknowledgedAt && !alert.resolvedAt && (
                                    <span className="flex items-center gap-1.5 text-blue-600 font-medium text-sm bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                        </svg>
                                        Acknowledged
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                    </div>
                ))}
            </div>
          )}
      </div>
    </div>
  );
}
