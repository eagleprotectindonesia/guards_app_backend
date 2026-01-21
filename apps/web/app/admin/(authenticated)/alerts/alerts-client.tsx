'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import AlertFeed, { AlertWithRelations } from '../components/alert-feed';
import PaginationNav from '../components/pagination-nav';
import AlertExport from '../components/alert-export';
import { useAlerts } from '../context/alert-context';

export const dynamic = 'force-dynamic';

export default function AdminAlertsPage() {
  const searchParams = useSearchParams();
  const page = parseInt(searchParams.get('page') || '1', 10);
  const perPage = parseInt(searchParams.get('per_page') || '10', 10);

  const [alerts, setAlerts] = useState<AlertWithRelations[]>([]);
  const [totalCount, setTotalCount] = useState(0);

  const { connectionStatus, lastAlertEvent } = useAlerts();

  // Fetch alerts with pagination
  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const res = await fetch(`/api/admin/alerts?page=${page}&per_page=${perPage}`);
        if (!res.ok) throw new Error('Failed to fetch alerts');
        const data = await res.json();
        setAlerts(data.data);
        setTotalCount(data.meta.total);
      } catch (err) {
        console.error('Error fetching alerts:', err);
      }
    };
    fetchAlerts();
  }, [page, perPage]);

  // React to global alert events from Context
  useEffect(() => {
    if (!lastAlertEvent) return;

    const data = lastAlertEvent;

    if ('type' in data) {
      if (data.type === 'alert_created') {
        // Only prepend if we are on the first page
        if (page === 1) {
          setAlerts(prev => {
            if (prev.find(a => a.id === data.alert.id)) return prev;
            // Add new alert to the top
            const newAlerts = [data.alert, ...prev];
            return newAlerts;
          });
          setTotalCount(prev => prev + 1);
        } else {
          // If not on page 1, just increment total count
          setTotalCount(prev => prev + 1);
        }
      } else if (data.type === 'alert_updated') {
        setAlerts(prev => prev.map(a => (a.id === data.alert.id ? data.alert : a)));
      } else if (data.type === 'alert_deleted') {
        setAlerts(prev => prev.filter(a => a.id !== data.alertId));
        setTotalCount(prev => Math.max(0, prev - 1));
      }
    } else if ('id' in data) {
      // Fallback logic for raw alert object
      if (page === 1) {
         setAlerts(prev => {
             if (prev.find(a => a.id === data.id)) return prev;
             return [data, ...prev];
         });
         setTotalCount(prev => prev + 1);
      }
    }
  }, [lastAlertEvent, page]);

  const handleAcknowledge = async (alertId: string) => {
    try {
      // Optimistically update the acknowledged status
      setAlerts(prev =>
        prev.map(a => {
          if (a.id !== alertId) return a;
          return {
            ...a,
            acknowledgedAt: new Date().toISOString(),
          };
        })
      );

      // Trigger the server update which will send the SSE update with full data
      await fetch(`/api/admin/alerts/${alertId}/acknowledge`, { method: 'POST' });
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <header className="mb-6 flex justify-between items-center bg-card p-4 rounded-xl shadow-sm border border-border">
        <div>
          <h1 className="text-2xl font-bold text-foreground">All Alerts</h1>
          <p className="text-sm text-muted-foreground">Comprehensive view of all system alerts</p>
        </div>
        <div className="flex items-center gap-4">
          <AlertExport />
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border ${
              connectionStatus === 'Connected'
                ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-900/30'
                : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900/30'
            }`}
          >
            <div
              className={`w-2 h-2 rounded-full ${
                connectionStatus === 'Connected' ? 'bg-green-500 animate-pulse' : 'bg-amber-500'
              }`}
            />
            {connectionStatus}
          </div>
        </div>
      </header>

      <div className="flex-1 flex flex-col">
        <AlertFeed
          alerts={alerts}
          onAcknowledge={handleAcknowledge}
          showResolutionDetails={true}
        />
        <PaginationNav page={page} perPage={perPage} totalCount={totalCount} />
      </div>
    </div>
  );
}
