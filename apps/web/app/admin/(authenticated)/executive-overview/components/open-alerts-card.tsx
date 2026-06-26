import React from 'react';
import { Card } from '@/components/ui/card';
import { UserX, MapPinOff, WifiOff, ClipboardX, Building2, ShieldCheck, ShieldAlert, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@repo/shared';

type ByReason = {
  missedCheckin: number;
  missedAttendance: number;
  geofenceBreach: number;
  locationServicesOff: number;
};

type TopSite = {
  siteId: string;
  siteName: string;
  total: number;
} | null;

type Props = {
  byReason: ByReason;
  total: number;
  deltaVsYesterday: number;
  topSite: TopSite;
};

const reasonPills = [
  { key: 'missedCheckin' as const, label: 'Missed Check-in', icon: UserX },
  { key: 'geofenceBreach' as const, label: 'Geofence Breach', icon: MapPinOff },
  { key: 'locationServicesOff' as const, label: 'Location Off', icon: WifiOff },
  { key: 'missedAttendance' as const, label: 'Attendance', icon: ClipboardX },
];

export function OpenAlertsCard({ byReason, total, deltaVsYesterday, topSite }: Props) {
  return (
    <Card className="border-border/60 bg-card p-5 shadow-md flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'rounded-xl border p-2.5 shrink-0',
            total > 0
              ? 'border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-400'
              : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
          )}
        >
          {total > 0 ? <ShieldAlert className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
        </div>
        <div className="space-y-0.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/80">
            Open Security Alerts
          </p>
          <p className="text-[10px] text-muted-foreground">Incident Status</p>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-1">
        {reasonPills.map(({ key, label, icon: Icon }) => {
          const value = byReason[key];
          const isHealthy = value === 0;
          return (
            <div key={key} className="flex flex-col items-center gap-1.5 py-1">
              <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/70 text-center leading-tight">
                {label}
              </p>
              <div
                className={cn(
                  'rounded-full p-2',
                  isHealthy ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'
                )}
              >
                <Icon className="h-5 w-5" />
              </div>
              <p
                className={cn(
                  'text-[11px] font-bold',
                  isHealthy ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                )}
              >
                {isHealthy ? 'OK' : `${value} Critical`}
              </p>
            </div>
          );
        })}

        <div className="flex flex-col items-center gap-1.5 py-1">
          <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/70 text-center leading-tight">
            Top Site
          </p>
          <div
            className={cn(
              'rounded-full p-2',
              topSite && topSite.total > 0
                ? 'bg-amber-500/10 text-amber-500'
                : 'bg-emerald-500/10 text-emerald-500'
            )}
          >
            <Building2 className="h-5 w-5" />
          </div>
          <p
            className={cn(
              'text-[11px] font-bold text-center leading-tight',
              topSite && topSite.total > 0
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-emerald-600 dark:text-emerald-400'
            )}
          >
            {topSite ? `${topSite.siteName} (${topSite.total})` : 'None'}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-border/40 pt-3">
        <div className="flex items-baseline gap-1.5">
          <span className="text-xs font-semibold text-muted-foreground">Total Open Alerts</span>
          <span
            className={cn(
              'text-sm font-extrabold',
              total > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
            )}
          >
            {total}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {deltaVsYesterday > 0 && (
            <>
              <TrendingUp className="h-3 w-3 text-rose-500" />
              <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                +{deltaVsYesterday} vs yesterday
              </span>
            </>
          )}
          {deltaVsYesterday < 0 && (
            <>
              <TrendingDown className="h-3 w-3 text-emerald-500" />
              <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                {deltaVsYesterday} vs yesterday
              </span>
            </>
          )}
          {deltaVsYesterday === 0 && (
            <span className="text-[11px] text-muted-foreground">No change</span>
          )}
        </div>
      </div>
    </Card>
  );
}
