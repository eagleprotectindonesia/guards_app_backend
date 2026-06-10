import React from 'react';
import { Card } from '@/components/ui/card';
import { ShieldCheck, Clock, Users, RefreshCw } from 'lucide-react';
import { cn } from '@repo/shared';
import { redis } from '@repo/database/redis';
import { getLastEmployeeSyncTimestamp } from '@repo/database';

export const dynamic = 'force-dynamic';

export default async function SystemDashboardPage() {
  // Derive active users count from Socket.io connections tracked in Redis
  const activeSocketUserIds = await redis.hvals('system:active_sockets').catch(() => []);
  const activeUsersCount = new Set(activeSocketUserIds).size;

  // Retrieve last employee sync timestamp from the database/redis
  const lastSyncTimestamp = await getLastEmployeeSyncTimestamp();

  const metricsList = [
    {
      label: 'System Status',
      value: 'Operational',
      hint: 'All Systems Running',
      hintTone: 'positive',
      icon: ShieldCheck,
      accentClass: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
      valueColor: 'text-emerald-600 dark:text-emerald-400',
    },
    {
      label: 'Uptime',
      value: '99.9%',
      hint: 'Last 30 Days',
      hintTone: 'positive',
      icon: Clock,
      accentClass: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
      valueColor: 'text-emerald-600 dark:text-emerald-400',
    },
    {
      label: 'Active Users',
      value: activeUsersCount.toString(),
      hint: 'Online Now',
      hintTone: 'info',
      icon: Users,
      accentClass: 'border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-400',
      valueColor: 'text-sky-600 dark:text-sky-400',
    },
    {
      label: 'Failed Sync',
      value: '0',
      hint: 'Last 24 Hours',
      hintTone: 'critical',
      icon: RefreshCw,
      accentClass: 'border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-400',
      valueColor: 'text-rose-600 dark:text-rose-500',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight text-foreground font-sans">System & Audit</h1>
          <p className="text-sm text-muted-foreground">
            Monitor system health metrics, online active sessions, and data sync statuses.
          </p>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {metricsList.map(metric => {
          const Icon = metric.icon;
          return (
            <Card
              key={metric.label}
              className="border-border/60 bg-card p-5 shadow-md hover:border-purple-500/40 transition-colors flex flex-col gap-0 justify-between"
            >
              <div className="flex items-center gap-4">
                <div className={cn('rounded-xl border p-3 shrink-0', metric.accentClass)}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="space-y-1 min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/80">
                    {metric.label}
                  </p>
                  <p
                    className={cn(
                      'text-3xl tracking-tight',
                      metric.label === 'System Status' || metric.label === 'Uptime' ? 'font-normal' : 'font-extrabold',
                      metric.valueColor
                    )}
                  >
                    {metric.value}
                  </p>
                  <p
                    className={cn(
                      'text-xs font-medium',
                      metric.hintTone === 'positive' && 'text-emerald-600 dark:text-emerald-400',
                      metric.hintTone === 'info' && 'text-sky-600 dark:text-sky-400',
                      metric.hintTone === 'critical' && 'text-rose-600 dark:text-rose-400',
                      metric.hintTone === 'neutral' && 'text-muted-foreground'
                    )}
                  >
                    {metric.hint}
                  </p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* 2nd Row: System Panels */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Panel 1: System Health */}
        <Card className="border-border/60 bg-card p-5 shadow-md flex flex-col justify-between">
          <div>
            <h3 className="text-lg font-bold text-foreground mb-4">System Health</h3>
            <div className="divide-y divide-border/40">
              <div className="flex items-center justify-between py-3">
                <span className="text-sm font-medium text-muted-foreground">Web Application</span>
                <span className="inline-flex items-center rounded-md bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  Healthy
                </span>
              </div>
              <div className="flex items-center justify-between py-3">
                <span className="text-sm font-medium text-muted-foreground">API Services</span>
                <span className="inline-flex items-center rounded-md bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  Healthy
                </span>
              </div>
              <div className="flex items-center justify-between py-3">
                <span className="text-sm font-medium text-muted-foreground">Database</span>
                <span className="inline-flex items-center rounded-md bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  Healthy
                </span>
              </div>
            </div>
          </div>
        </Card>

        {/* Panel 2: API & Integration Status */}
        <Card className="border-border/60 bg-card p-5 shadow-md flex flex-col justify-between">
          <div>
            <h3 className="text-lg font-bold text-foreground mb-4">API & Integration Status</h3>
            <div className="divide-y divide-border/40">
              <div className="flex items-center justify-between py-3">
                <span className="text-sm font-medium text-muted-foreground">MindCore API</span>
                {process.env.EXTERNAL_EMPLOYEE_API_KEY ? (
                  <span className="inline-flex items-center rounded-md bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    Connected
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-md bg-rose-500/10 px-2.5 py-0.5 text-xs font-semibold text-rose-600 dark:text-rose-400 border border-rose-500/20">
                    Disconnected
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between py-3">
                <span className="text-sm font-medium text-muted-foreground">Panic App</span>
                {process.env.PANIC_APP_API_KEY ? (
                  <span className="inline-flex items-center rounded-md bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    Connected
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-md bg-rose-500/10 px-2.5 py-0.5 text-xs font-semibold text-rose-600 dark:text-rose-400 border border-rose-500/20">
                    Disconnected
                  </span>
                )}
              </div>
            </div>
          </div>
        </Card>

        {/* Panel 3: Data Sync Status */}
        <Card className="border-border/60 bg-card p-5 shadow-md flex flex-col justify-between">
          <div>
            <h3 className="text-lg font-bold text-foreground mb-4">Data Sync Status</h3>
            <div className="divide-y divide-border/40">
              <div className="flex items-center justify-between py-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-foreground">Employee Sync</span>
                  <span className="text-xs text-muted-foreground">
                    Last sync:{' '}
                    {lastSyncTimestamp
                      ? new Date(lastSyncTimestamp).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
                      : 'Never'}
                  </span>
                </div>
                <span className="inline-flex items-center rounded-md bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  Success
                </span>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
