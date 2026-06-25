import React from 'react';
import { Card } from '@/components/ui/card';
import { ShieldCheck, Users, Building2, Ticket, Activity, UserCheck } from 'lucide-react';
import { cn } from '@repo/shared';
import { getExecutiveOverviewMetrics } from '@repo/database';
import { requirePermission } from '@/lib/admin-auth';
import { WorkforceBreakdownCard } from './components/workforce-breakdown-card';
import { GuardActivityTodayCard } from './components/guard-activity-today-card';
import { TodayOperationsSummaryCard } from './components/today-operations-summary-card';
import { CheckInPerformanceCard } from './components/check-in-performance-card';
import { PatrolCompletionCard } from './components/patrol-completion-card';

export const dynamic = 'force-dynamic';

function ProgressBar({ pct, color }: { pct: number; color: 'emerald' | 'purple' }) {
  const [trackClass, fillClass] =
    color === 'emerald'
      ? ['bg-emerald-500/20', 'bg-emerald-500']
      : ['bg-purple-500/20', 'bg-purple-500'];
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full', trackClass)}>
      <div className={cn('h-full rounded-full transition-all', fillClass)} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}

function Badge({ count, label, variant }: { count: number; label: string; variant: 'sky' | 'amber' | 'purple' }) {
  const variantStyles = {
    sky: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20',
    amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    purple: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold leading-tight',
        variantStyles[variant]
      )}
    >
      <span className="tabular-nums">{count}</span>
      <span>{label}</span>
    </span>
  );
}

export default async function ExecutiveOverviewPage() {
  await requirePermission('dashboard-executive:view');

  const metrics = await getExecutiveOverviewMetrics();
  const { totalEmployees, activeSites, totalSites, activeGuardsOnDuty, scheduledShiftsToday, openTickets, workforceBreakdown, guardActivityToday, todayOperationsSummary, patrolCompletion } = metrics;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight text-foreground font-sans">Executive Overview</h1>
          <p className="text-sm text-muted-foreground">
            Real-time summary of Eagle Protect operations and performance.
          </p>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {/* Card 1: Company Status */}
        <Card className="border-border/60 bg-card p-5 shadow-md flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-2.5 text-emerald-600 dark:text-emerald-400 shrink-0">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/80">
              Company Status
            </p>
          </div>
          <div>
            <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">HEALTHY</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Operations running normally</p>
          </div>
        </Card>

        {/* Card 2: Total Employees */}
        <Card className="border-border/60 bg-card p-5 shadow-md flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-sky-500/20 bg-sky-500/10 p-2.5 text-sky-600 dark:text-sky-400 shrink-0">
              <Users className="h-4 w-4" />
            </div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/80">
              Total Employees
            </p>
          </div>
          <div>
            <p className="text-3xl font-extrabold tracking-tight text-foreground">{totalEmployees}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">All Employees</p>
          </div>
        </Card>

        {/* Card 3: Active Guards */}
        <Card className="border-border/60 bg-card p-5 shadow-md flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-2.5 text-emerald-600 dark:text-emerald-400 shrink-0">
              <UserCheck className="h-4 w-4" />
            </div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/80">
              Active Guards
            </p>
          </div>
          <div>
            <p className="text-3xl font-extrabold tracking-tight text-foreground">
              <span className="text-emerald-600 dark:text-emerald-400">{activeGuardsOnDuty}</span>
              <span className="text-muted-foreground/50 mx-1.5">/</span>
              <span>{scheduledShiftsToday}</span>
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">On Duty / Scheduled Today</p>
          </div>
          {scheduledShiftsToday > 0 && (
            <div className="space-y-1">
              <ProgressBar pct={(activeGuardsOnDuty / scheduledShiftsToday) * 100} color="emerald" />
              <p className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                {((activeGuardsOnDuty / scheduledShiftsToday) * 100).toFixed(1)}%
              </p>
            </div>
          )}
        </Card>

        {/* Card 4: Active Sites */}
        <Card className="border-border/60 bg-card p-5 shadow-md flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-purple-500/20 bg-purple-500/10 p-2.5 text-purple-600 dark:text-purple-400 shrink-0">
              <Building2 className="h-4 w-4" />
            </div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/80">
              Active Sites
            </p>
          </div>
          <div>
            <p className="text-3xl font-extrabold tracking-tight text-foreground">
              <span className="text-purple-600 dark:text-purple-400">{activeSites}</span>
              <span className="text-muted-foreground/50 mx-1.5">/</span>
              <span>{totalSites}</span>
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">Online / Total Sites</p>
          </div>
          {totalSites > 0 && (
            <div className="space-y-1">
              <ProgressBar pct={(activeSites / totalSites) * 100} color="purple" />
              <p className="text-[10px] font-medium text-purple-600 dark:text-purple-400">
                {((activeSites / totalSites) * 100).toFixed(1)}%
              </p>
            </div>
          )}
        </Card>

        {/* Card 5: Open Tickets */}
        <Card className="border-border/60 bg-card p-5 shadow-md flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-2.5 text-amber-600 dark:text-amber-400 shrink-0">
              <Ticket className="h-4 w-4" />
            </div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/80">
              Open Tickets
            </p>
          </div>
          <div>
            <p className="text-3xl font-extrabold tracking-tight text-amber-600 dark:text-amber-400">
              {openTickets.total}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">Total Open Tickets</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge count={openTickets.unassigned} label="Unassigned" variant="sky" />
            <Badge count={openTickets.inProgress} label="In Progress" variant="amber" />
            <Badge count={openTickets.acknowledged} label="Acknowledged" variant="purple" />
          </div>
        </Card>

        {/* Card 6: System Status */}
        <Card className="border-border/60 bg-card p-5 shadow-md flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-2.5 text-emerald-600 dark:text-emerald-400 shrink-0">
              <Activity className="h-4 w-4" />
            </div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/80">
              System Status
            </p>
          </div>
          <div>
            <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">Operational</p>
            <p className="mt-0.5 text-xs text-muted-foreground">All Systems Running</p>
          </div>
          <div className="mt-auto flex items-baseline gap-1.5 border-t border-border/40 pt-2 text-xs">
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">Uptime</span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400">99.9%</span>
            <span className="text-muted-foreground">(30 Days)</span>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <WorkforceBreakdownCard {...workforceBreakdown} />
        <GuardActivityTodayCard {...guardActivityToday} />
        <TodayOperationsSummaryCard {...todayOperationsSummary} />
        <CheckInPerformanceCard {...guardActivityToday} />
        <PatrolCompletionCard {...patrolCompletion} />
      </div>
    </div>
  );
}
