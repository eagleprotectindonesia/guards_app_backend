import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import {
  Building2,
  MapPin,
  Layers,
  ShieldCheck,
  CalendarClock,
  MapPinned,
  FileCheck,
} from 'lucide-react';
import {
  getClientSiteDashboardMetrics,
  getSiteAssignmentDashboardMetrics,
  prisma,
  getPanicSubscriptionStats,
} from '@repo/database';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { format } from 'date-fns';
import SiteStatusChart from './components/site-status-chart';
import SiteAssignmentChart from './components/site-assignment-chart';

export const dynamic = 'force-dynamic';

export default async function ClientSiteDashboardPage() {
  await requirePermission(PERMISSIONS.SITES.VIEW);

  const [metrics, assignmentMetrics, recentSites, subscriptionStats] = await Promise.all([
    getClientSiteDashboardMetrics(),
    getSiteAssignmentDashboardMetrics(),
    prisma.site.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: {
        createdBy: {
          select: { name: true },
        },
        _count: {
          select: {
            posts: {
              where: {
                status: true,
                deletedAt: null,
              },
            },
          },
        },
      },
    }),
    getPanicSubscriptionStats().catch((err) => {
      console.error('Error fetching panic subscription stats:', err);
      return null;
    }),
  ]);

  const activeContractsCount = subscriptionStats?.data?.subscriptions?.active;
  const endingIn30DaysCount = subscriptionStats?.data?.subscriptions?.endingIn30Days;

  const metricsList = [
    {
      label: 'Total Clients',
      value: metrics.totalClients.toString(),
      hint: 'Distinct client companies',
      hintTone: 'neutral',
      icon: Building2,
      accentClass: 'border-blue-500/20 bg-blue-500/10 text-blue-400',
      iconColor: 'text-sky-400',
    },
    {
      label: 'Active Sites',
      value: metrics.activeSites.toString(),
      hint: `${((metrics.activeSites / (metrics.totalSites || 1)) * 100).toFixed(1)}% of total sites`,
      hintTone: 'positive',
      icon: MapPin,
      accentClass: 'border-teal-500/20 bg-teal-500/10 text-teal-400',
      iconColor: 'text-teal-400',
    },
    {
      label: 'Site Posts',
      value: metrics.totalPosts.toString(),
      hint: 'Configured checkpoints',
      hintTone: 'neutral',
      icon: Layers,
      accentClass: 'border-purple-500/20 bg-purple-500/10 text-purple-400',
      iconColor: 'text-purple-400',
    },
    {
      label: 'Active Geofences',
      value: metrics.activeGeofences.toString(),
      hint: `${((metrics.activeGeofences / (metrics.totalSites || 1)) * 100).toFixed(1)}% geofenced`,
      hintTone: 'warning',
      icon: ShieldCheck,
      accentClass: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400',
      iconColor: 'text-emerald-400',
    },
    {
      label: 'active contracts',
      value: activeContractsCount !== undefined ? activeContractsCount.toString() : 'N/A',
      hint: activeContractsCount !== undefined
        ? `${endingIn30DaysCount} ending in 30 days`
        : 'Failed to fetch',
      hintTone: activeContractsCount !== undefined ? 'neutral' : 'critical',
      icon: FileCheck,
      accentClass: 'border-indigo-500/20 bg-indigo-500/10 text-indigo-400',
      iconColor: 'text-indigo-400',
    },
  ];

  const assignmentStats = [
    {
      label: 'Assigned Sites',
      value: assignmentMetrics.assignedSites,
      icon: CalendarClock,
      iconClass: 'text-sky-400',
      accentClass: 'border-sky-500/20 bg-sky-500/10',
      hint: `${((assignmentMetrics.assignedSites / (assignmentMetrics.totalSites || 1)) * 100).toFixed(1)}% of total sites`,
    },
    {
      label: 'Unassigned Sites',
      value: assignmentMetrics.unassignedSites,
      icon: MapPinned,
      iconClass: 'text-amber-400',
      accentClass: 'border-amber-500/20 bg-amber-500/10',
      hint: `${((assignmentMetrics.unassignedSites / (assignmentMetrics.totalSites || 1)) * 100).toFixed(1)}% without a scheduled shift`,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Client & Site Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Monitor client metrics, active security locations, check-in posts, and recent events.
          </p>
        </div>
      </div>

      {/* Row 1: 5 Metric Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {metricsList.map((metric) => {
          const Icon = metric.icon;
          return (
            <Card key={metric.label} className="border-[#1f2432] bg-[#11141d] p-5 shadow-md hover:border-[#2f374c] transition-colors flex flex-col gap-0 justify-between">
              <div className="flex items-center gap-4">
                <div className={`rounded-xl border p-3 shrink-0 ${metric.accentClass}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="space-y-1 min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/80">{metric.label}</p>
                  <p className={`text-3xl font-extrabold tracking-tight ${metric.iconColor}`}>{metric.value}</p>
                  <p className={`text-xs font-medium ${
                    metric.hintTone === 'positive' && 'text-emerald-400'
                  } ${
                    metric.hintTone === 'warning' && 'text-amber-400'
                  } ${
                    metric.hintTone === 'critical' && 'text-rose-400'
                  } ${
                    metric.hintTone === 'neutral' && 'text-muted-foreground'
                  }`}>{metric.hint}</p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Row 2: Grid Content */}
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {/* Column 1: Site Status Overview */}
        <Card className="border-[#1f2432] bg-[#11141d] shadow-md flex flex-col justify-between">
          <CardHeader className="border-b border-[#1f2432] pb-4">
            <div className="space-y-1">
              <CardTitle className="text-lg font-bold text-foreground">Site Status Overview</CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Distribution of active and inactive security sites.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-6 flex-1 flex flex-col justify-center items-center">
            <SiteStatusChart activeSites={metrics.activeSites} inactiveSites={metrics.inactiveSites} />
          </CardContent>
        </Card>

        {/* Column 2: Site Assignment */}
        <Card className="border-[#1f2432] bg-[#11141d] shadow-md flex flex-col justify-between">
          <CardHeader className="border-b border-[#1f2432] pb-4">
            <div className="space-y-1">
              <CardTitle className="text-lg font-bold text-foreground">Site Assignment</CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Assigned vs unassigned sites based on scheduled shifts starting in the next 7 days.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-6 flex-1 flex flex-col justify-center gap-6">
            <SiteAssignmentChart
              assigned={assignmentMetrics.assignedSites}
              unassigned={assignmentMetrics.unassignedSites}
            />
            <div className="grid gap-3">
              {assignmentStats.map((stat) => {
                const Icon = stat.icon;
                return (
                  <div
                    key={stat.label}
                    className={`flex items-center justify-between rounded-xl border p-4 ${stat.accentClass}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="rounded-lg border border-white/10 bg-[#161a25]/40 p-2 shrink-0">
                        <Icon className={`h-4 w-4 ${stat.iconClass}`} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">{stat.label}</p>
                        <p className="text-[10px] text-muted-foreground">{stat.hint}</p>
                      </div>
                    </div>
                    <span className={`text-2xl font-extrabold tabular-nums ${stat.iconClass}`}>{stat.value}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Column 3: Recently Added Sites */}
        <Card className="border-[#1f2432] bg-[#11141d] shadow-md flex flex-col justify-between">
          <CardHeader className="border-b border-[#1f2432] pb-4">
            <div className="space-y-1">
              <CardTitle className="text-lg font-bold text-foreground">Recently Added Sites</CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Latest security sites added to the system.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-6 flex-1 flex flex-col justify-start gap-4">
            {recentSites.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                <span className="text-sm">No sites created yet</span>
              </div>
            ) : (
              <div className="space-y-4">
                {recentSites.map((site) => (
                  <div key={site.id} className="flex items-center justify-between p-3 rounded-lg border border-[#1f2432]/60 bg-[#161a25]/20">
                    <div className="space-y-0.5 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{site.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        Client: {site.clientName || 'N/A'} • {site._count.posts} checkpoints
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${
                        site.status ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                      }`}>
                        {site.status ? 'Active' : 'Inactive'}
                      </span>
                      <span className="text-[9px] text-muted-foreground/60">
                        {format(new Date(site.createdAt), 'MMM dd, yyyy')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
