'use client';

import { ShieldCheck, Building2, UserCheck } from 'lucide-react';
import { useAlerts } from '../context/alert-context';
import { LoadingBlock } from '../components/loading/loading-block';
import { NewDashboardSkeleton } from '../components/loading/new-dashboard-skeleton';

function PlaceholderTopCard() {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <LoadingBlock className="h-10 w-10 rounded-lg" />
        <div className="space-y-2">
          <LoadingBlock className="h-3 w-20" />
          <LoadingBlock className="h-6 w-12" />
        </div>
      </div>
      <LoadingBlock className="mt-3 h-3 w-16" />
    </div>
  );
}

function PlaceholderCard({ className = '' }: { className?: string }) {
  return <div className={`rounded-xl border border-border bg-card p-4 shadow-sm ${className}`}><LoadingBlock className="h-full w-full" /></div>;
}

export default function NewDashboardClient() {
  const { activeSites, isDashboardInitialized } = useAlerts();

  if (!isDashboardInitialized) {
    return <NewDashboardSkeleton />;
  }

  const activeSitesCount = activeSites.length;
  const onDutyCount = activeSites.reduce(
    (acc, site) =>
      acc + site.shifts.filter(shift => shift.employee && shift.attendance && shift.attendance.status !== 'absent').length,
    0
  );

  return (
    <div className="mx-auto max-w-400 space-y-4 p-4">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10 text-green-600 dark:text-green-400">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Active Guards</p>
              <p className="text-2xl font-bold text-foreground">{onDutyCount}</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">On Duty</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Active Sites</p>
              <p className="text-2xl font-bold text-foreground">{activeSitesCount}</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Online</p>
        </div>

        <PlaceholderTopCard />
        <PlaceholderTopCard />
        <PlaceholderTopCard />
        <PlaceholderTopCard />
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 space-y-4 lg:col-span-3">
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <LoadingBlock className="h-4 w-32" />
            <div className="mt-6 flex justify-center">
              <LoadingBlock className="h-48 w-48 rounded-full border-12 border-muted/20" />
            </div>
            <div className="mt-6 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <LoadingBlock className="h-2 w-2 rounded-full" />
                    <LoadingBlock className="h-3 w-16" />
                  </div>
                  <LoadingBlock className="h-3 w-12" />
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-foreground">Guard Status</h3>
            <div className="mt-4 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <UserCheck className="h-4 w-4 text-green-500" />
                <span>On Duty</span>
              </div>
              <span className="text-xl font-bold text-green-600 dark:text-green-400">{onDutyCount}</span>
            </div>
          </div>

          <PlaceholderCard className="h-[220px]" />
        </div>

        <div className="col-span-12 space-y-4 lg:col-span-6">
          <PlaceholderCard className="h-125 p-1" />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <PlaceholderCard className="h-64" />
            <PlaceholderCard className="h-64" />
          </div>
        </div>

        <div className="col-span-12 space-y-4 lg:col-span-3">
          <PlaceholderCard className="h-100" />
          <PlaceholderCard className="h-90" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-3">
            <LoadingBlock className="h-3 w-24" />
            <div className="flex items-end justify-between">
              <div className="space-y-2">
                <LoadingBlock className="h-6 w-12" />
                <LoadingBlock className="h-3 w-20" />
              </div>
              <LoadingBlock className="h-8 w-24 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
