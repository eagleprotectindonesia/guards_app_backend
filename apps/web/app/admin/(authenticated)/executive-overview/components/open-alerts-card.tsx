import React from 'react';
import { Card } from '@/components/ui/card';
import {
  UserX,
  ClipboardX,
  Building2,
  ShieldCheck,
  ShieldAlert,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { cn } from '@repo/shared';

type ByReason = {
  missedCheckin: number;
  missedAttendance: number;
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

const reasonItems = [
  { key: 'missedCheckin' as const, label: 'Missed Check-in', icon: UserX },
  { key: 'missedAttendance' as const, label: 'Attendance', icon: ClipboardX },
];

export function OpenAlertsCard({ byReason, total, deltaVsYesterday, topSite }: Props) {
  return (
    <Card className="border-border/60 bg-card shadow-md flex flex-col">
      <div className="px-5 py-4">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'rounded-lg p-2 shrink-0',
              total > 0
                ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
            )}
          >
            {total > 0 ? <ShieldAlert className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
          </div>
          <p className="text-sm font-bold text-foreground">OPEN SECURITY ALERTS</p>
        </div>
      </div>

      <div className="px-5 pb-2">
        {reasonItems.map(({ key, label, icon: Icon }, i) => {
          const value = byReason[key];
          const isHealthy = value === 0;
          return (
            <div
              key={key}
              className={cn(
                'flex items-center justify-between py-2.5',
                i < reasonItems.length - 1 && 'border-b border-border/40'
              )}
            >
              <div className="flex items-center gap-2.5">
                <Icon className={cn('h-4 w-4', isHealthy ? 'text-emerald-500' : 'text-rose-500')} />
                <span className="text-xs font-medium text-foreground">{label}</span>
              </div>
              <span
                className={cn(
                  'inline-flex items-center justify-center rounded-md px-2 py-0.5 text-xs font-bold min-w-10',
                  isHealthy
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                    : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                )}
              >
                {isHealthy ? 'OK' : `${value}`}
              </span>
            </div>
          );
        })}

        <div className={cn('flex items-center justify-between py-2.5 border-b border-border/40')}>
          <div className="flex items-center gap-2.5">
            <Building2 className="h-4 w-4 text-amber-500" />
            <span className="text-xs font-medium text-foreground">Top Site</span>
          </div>
          <span
            className={cn(
              'inline-flex items-center justify-center rounded-md px-2 py-0.5 text-xs font-bold min-w-10',
              topSite && topSite.total > 0
                ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
            )}
          >
            {topSite ? `${topSite.siteName} (${topSite.total})` : 'None'}
          </span>
        </div>
      </div>

      <div className="px-5 pb-5 pt-2">
        <div className="flex items-center justify-between">
          <div className="flex items-baseline gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground">Total</span>
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
            {deltaVsYesterday === 0 && <span className="text-[11px] text-muted-foreground">No change</span>}
          </div>
        </div>
      </div>
    </Card>
  );
}
