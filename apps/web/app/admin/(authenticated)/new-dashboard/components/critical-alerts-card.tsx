import { AlertTriangle } from 'lucide-react';
import { format, isToday } from 'date-fns';
import Link from 'next/link';
import { useNewDashboardStream, type NewDashboardAlert } from '../../context/new-dashboard-stream-context';
import { LoadingBlock } from '../../components/loading/loading-block';
import { PanicAlert } from '@repo/types';

export type MappedPanicAlert = {
  id: string;
  severity: 'critical';
  status: string;
  reason: string;
  createdAt: string;
  shift: {
    employee: {
      fullName: string;
    };
  };
  site: {
    name: string;
  };
  isPanic: boolean;
};

export type UnifiedDashboardAlert = NewDashboardAlert | MappedPanicAlert;

export function mapPanicAlertToDashboardAlert(p: PanicAlert): MappedPanicAlert {
  return {
    id: `panic-${p.id}`,
    severity: 'critical' as const,
    status: p.status,
    reason: 'SOS_ALERT',
    createdAt: p.createdAt,
    shift: {
      employee: {
        fullName: `${p.firstName} ${p.lastName}`,
      },
    },
    site: {
      name: `SOS Alert (${p.latitude.toFixed(4)}, ${p.longitude.toFixed(4)})`,
    },
    isPanic: true,
  };
}

function severityBadgeClass(alert: UnifiedDashboardAlert): string {
  if (alert.severity === 'critical') {
    return 'bg-red-500/15 text-red-600 dark:text-red-400';
  }
  return 'bg-amber-500/15 text-amber-600 dark:text-amber-400';
}

function severityLabel(alert: UnifiedDashboardAlert): string {
  if (alert.severity === 'critical') return 'High';
  if (alert.status === 'need_attention') return 'Medium';
  return 'Low';
}

function reasonLabel(alert: UnifiedDashboardAlert): string {
  return alert.reason.replace(/_/g, ' ');
}

function guardSiteLabel(alert: UnifiedDashboardAlert): string {
  const guardName = alert.shift?.employee?.fullName || 'Unassigned Guard';
  const siteName = alert.site?.name || 'Unknown Site';
  return `${guardName} - ${siteName}`;
}

function alertRowBackgroundClass(alert: UnifiedDashboardAlert): string {
  if (alert.severity === 'critical') {
    return 'bg-red-500/10';
  }
  return 'bg-amber-500/10';
}

type CriticalAlertsCardProps = {
  panicAlerts?: PanicAlert[];
};

export function CriticalAlertsCard({ panicAlerts = [] }: CriticalAlertsCardProps) {
  const { criticalAlerts } = useNewDashboardStream();

  const mappedPanics = panicAlerts.map(mapPanicAlertToDashboardAlert);

  const mergedAlerts: UnifiedDashboardAlert[] = [...mappedPanics, ...criticalAlerts.data];

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm h-100 flex flex-col">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          Critical Alerts
          <sup className="ml-1.5 rounded bg-red-600 px-2 py-0.5 text-xs font-bold text-white">
            {mergedAlerts.length}
          </sup>
        </h3>
        <Link href="/admin/alerts" className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400">
          View All
        </Link>
      </div>

      {(criticalAlerts.status === 'loading' || criticalAlerts.status === 'idle') && mergedAlerts.length === 0 && (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-lg bg-muted/20 p-3 space-y-2">
              <div className="flex justify-between">
                <LoadingBlock className="h-3 w-20" />
                <LoadingBlock className="h-3 w-12" />
              </div>
              <LoadingBlock className="h-4 w-32" />
              <div className="flex justify-between items-center">
                <LoadingBlock className="h-3 w-24" />
                <LoadingBlock className="h-3 w-10" />
              </div>
            </div>
          ))}
        </div>
      )}

      {criticalAlerts.status === 'ready' && mergedAlerts.length === 0 && (
        <div className="h-[calc(100%-2.5rem)] flex items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
          No active alerts
        </div>
      )}

      {mergedAlerts.length > 0 && (
        <div className="flex-1 space-y-3 overflow-y-auto pr-1">
          {mergedAlerts.slice(0, 10).map(alert => (
            <div key={alert.id} className={`rounded-lg border border-border p-3 ${alertRowBackgroundClass(alert)}`}>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <AlertTriangle
                    className={`h-3.5 w-3.5 shrink-0 ${alert.severity === 'critical' ? 'text-red-500' : 'text-amber-500'}`}
                  />
                  <span className="truncate text-xs font-semibold uppercase tracking-wide text-foreground/90">
                    {reasonLabel(alert)}
                  </span>
                </div>
                <span className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-semibold ${severityBadgeClass(alert)}`}>
                  {severityLabel(alert)}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 text-sm font-medium text-foreground truncate">{guardSiteLabel(alert)}</div>
                <div className="shrink-0 text-xs text-muted-foreground">
                  {(() => {
                    const createdAt = new Date(alert.createdAt);
                    return isToday(createdAt) ? format(createdAt, 'hh:mm a') : format(createdAt, 'MMM d');
                  })()}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
