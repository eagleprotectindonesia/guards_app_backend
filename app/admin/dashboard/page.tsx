'use client';

import { useState, useEffect, useRef } from 'react';

export default function AdminDashboard() {
  const [sites, setSites] = useState<any[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [alerts, setAlerts] = useState<any[]>([]);
  const [connectionStatus, setConnectionStatus] = useState('Disconnected');
  const eventSourceRef = useRef<EventSource | null>(null);

  // Fetch Sites
  useEffect(() => {
    fetch('/api/admin/sites')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setSites(data);
      });
  }, []);

  // Connect SSE
  useEffect(() => {
    if (!selectedSiteId) return;

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const es = new EventSource(`/api/admin/alerts/stream?siteId=${selectedSiteId}`);
    setConnectionStatus('Connecting...');

    es.onopen = () => setConnectionStatus('Connected');

    es.onerror = () => {
      setConnectionStatus('Error/Disconnected');
      // es.close(); // Optional: let it retry or close
    };

    es.addEventListener('backfill', (e: any) => {
      try {
        const data = JSON.parse(e.data);
        setAlerts(data);
      } catch (err) {
        console.error('Error parsing backfill', err);
      }
    });

    es.addEventListener('alert', (e: any) => {
      try {
        const data = JSON.parse(e.data);
        const newAlert = data.alert || data; // Handle wrapper if needed

        // Check if payload is { type: '...', alert: ... } or just alert
        // My API implementation sent message as string.
        // Worker sends: JSON.stringify({ type: "alert_created", alert })

        if (data.type === 'alert_created') {
          setAlerts(prev => [data.alert, ...prev]);
        } else if (data.type === 'alert_updated') {
          setAlerts(prev => prev.map(a => (a.id === data.alert.id ? data.alert : a)));
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

  const handleAction = async (alertId: string, action: 'acknowledge' | 'resolve') => {
    try {
      await fetch(`/api/admin/alerts/${alertId}/${action}`, { method: 'POST' });
      // Optimistic update not strictly needed as SSE will return the update
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div>
      <header className="mb-8 flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-800">Admin Dashboard</h1>
        <div className="flex items-center gap-4">
          <span
            className={`px-3 py-1 rounded text-sm font-mono ${
              connectionStatus === 'Connected' ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'
            }`}
          >
            {connectionStatus}
          </span>
          <select
            className="border p-2 rounded"
            value={selectedSiteId}
            onChange={e => setSelectedSiteId(e.target.value)}
          >
            <option value="">Select Site...</option>
            {sites.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Alerts Column */}
        <div className="col-span-2 space-y-4">
          <h2 className="text-xl font-semibold mb-4">Realtime Alerts</h2>
          {alerts.length === 0 && <p className="text-gray-500 italic">No active alerts.</p>}

          {alerts.map(alert => (
            <div
              key={alert.id}
              className={`p-4 rounded-lg shadow bg-white border-l-4 ${
                alert.severity === 'critical' ? 'border-red-500' : 'border-orange-400'
              } ${alert.resolvedAt ? 'opacity-50' : ''}`}
            >
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold uppercase text-sm text-gray-600">{alert.reason}</span>
                    <span className="text-xs bg-gray-200 px-2 py-0.5 rounded">{alert.severity}</span>
                  </div>
                  <p className="mt-1 font-medium">
                    Shift Type: {alert.shift?.shiftType?.name} (Site: {alert.site?.name})
                  </p>
                  <p className="text-sm text-gray-500">Guard: {alert.shift?.guard?.name || 'Unassigned'}</p>
                  <p className="text-xs text-gray-400 mt-1">Window: {new Date(alert.windowStart).toLocaleString()}</p>
                </div>

                <div className="flex flex-col gap-2">
                  {!alert.acknowledgedAt && !alert.resolvedAt && (
                    <button
                      onClick={() => handleAction(alert.id, 'acknowledge')}
                      className="bg-blue-100 text-blue-700 px-3 py-1 rounded text-sm hover:bg-blue-200"
                    >
                      Acknowledge
                    </button>
                  )}
                  {!alert.resolvedAt && (
                    <button
                      onClick={() => handleAction(alert.id, 'resolve')}
                      className="bg-green-100 text-green-700 px-3 py-1 rounded text-sm hover:bg-green-200"
                    >
                      Resolve
                    </button>
                  )}
                  {alert.resolvedAt && <span className="text-green-600 font-bold text-sm">RESOLVED</span>}
                  {alert.acknowledgedAt && !alert.resolvedAt && (
                    <span className="text-blue-600 font-bold text-xs text-right">ACKNOWLEDGED</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Quick Actions / Stats (Placeholder) */}
        <div className="bg-white p-6 rounded shadow h-fit">
          <h3 className="font-bold text-lg mb-4">Stats</h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span>Active Alerts</span>
              <span className="font-mono font-bold">{alerts.filter(a => !a.resolvedAt).length}</span>
            </div>
            <div className="flex justify-between">
              <span>Total Today</span>
              <span className="font-mono font-bold">{alerts.length}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
