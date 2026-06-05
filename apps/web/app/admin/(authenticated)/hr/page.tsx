import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { 
  Clock, 
  AlertCircle, 
  FileText, 
  CheckCircle2, 
  XCircle, 
  Calendar, 
  ArrowRight,
  TrendingUp,
  UserX,
  MapPin
} from 'lucide-react';
import { cn } from '@repo/shared';
import { getTotalEmployeeCount } from '@repo/database';
import { HRMetrics } from './components/hr-metrics';

export const dynamic = 'force-dynamic';

export default async function HRDashboardPage() {
  const totalEmployees = await getTotalEmployeeCount();

  const leaveStats = [
    { label: 'Pending Approval', count: 12, percentage: 35, color: 'bg-amber-500', textColor: 'text-amber-400' },
    { label: 'Approved (This Month)', count: 24, percentage: 55, color: 'bg-emerald-500', textColor: 'text-emerald-400' },
    { label: 'Rejected/Cancelled', count: 4, percentage: 10, color: 'bg-rose-500', textColor: 'text-rose-400' },
  ];

  const shiftSummaries = [
    { site: 'Grand Indonesia Mall', scheduled: 12, present: 11, late: 1, missed: 0, status: '91% Check-in' },
    { site: 'Pakuwon Tower Office', scheduled: 8, present: 8, late: 0, missed: 0, status: '100% Check-in' },
    { site: 'Sudirman Central Plaza', scheduled: 10, present: 9, late: 0, missed: 1, status: '90% Check-in' },
    { site: 'Plaza Senayan Res.', scheduled: 6, present: 5, late: 1, missed: 0, status: '83% Check-in' },
  ];

  const activities = [
    { id: 1, user: 'Budi Santoso', action: 'Requested annual leave', time: '10 mins ago', detail: 'June 12 - June 15 (4 days)' },
    { id: 2, user: 'Siti Rahma', action: 'Clocked in late', time: '25 mins ago', detail: 'Site: Pakuwon Tower (+15 mins)' },
    { id: 3, user: 'Rian Hidayat', action: 'Submitted shift swap request', time: '1 hour ago', detail: 'Swap with Agus W. for Night Shift' },
    { id: 4, user: 'Admin HR', action: 'Updated Holiday Calendar', time: '2 hours ago', detail: 'Added Eid al-Adha Joint Leave' },
    { id: 5, user: 'Dewi Lestari', action: 'Completed onboarding', time: 'Yesterday', detail: 'Role: Guard Level I' },
  ];

  const upcomingHolidays = [
    { name: 'Eid al-Adha (Joint Leave)', date: 'Monday, June 15, 2026', daysRemaining: '10 days away' },
    { name: 'Islamic New Year', date: 'Tuesday, July 7, 2026', daysRemaining: '32 days away' },
    { name: 'Independence Day', date: 'Monday, August 17, 2026', daysRemaining: '73 days away' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">HR Dashboard</h1>
          <p className="text-sm text-muted-foreground">Monitor employee metrics, schedules, leave statuses, and upcoming events.</p>
        </div>
      </div>

      {/* Metric Cards */}
      <HRMetrics
        totalEmployees={totalEmployees}
        activeOnDutyCount={42}
        onLeaveTodayCount={8}
        pendingLeaveCount={12}
      />

      {/* Main Grid Content */}
      <div className="grid gap-6 xl:grid-cols-3">
        {/* Left Column - Shift summaries and Leaves (Span 2) */}
        <div className="space-y-6 xl:col-span-2">
          {/* Shift Schedule & Attendance Overview Card */}
          <Card className="border-[#1f2432] bg-[#11141d] shadow-md">
            <CardHeader className="flex flex-row items-center justify-between border-b border-[#1f2432] pb-4">
              <div className="space-y-1">
                <CardTitle className="text-lg font-bold text-foreground">Shift & Attendance Summary</CardTitle>
                <CardDescription className="text-xs text-muted-foreground">Live summary of guard shift allocations and compliance per active site.</CardDescription>
              </div>
              <span className="text-xs text-blue-400 hover:underline cursor-pointer flex items-center gap-1">
                View Shifts <ArrowRight className="h-3 w-3" />
              </span>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-[#1f2432]/60 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80">
                      <th className="pb-3 pr-4">Active Site Location</th>
                      <th className="pb-3 px-4 text-center">Scheduled</th>
                      <th className="pb-3 px-4 text-center">Present</th>
                      <th className="pb-3 px-4 text-center">Late</th>
                      <th className="pb-3 px-4 text-center">Missed</th>
                      <th className="pb-3 pl-4 text-right">Compliance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1f2432]/40 text-foreground/90">
                    {shiftSummaries.map((summary, idx) => (
                      <tr key={idx} className="hover:bg-white/[0.02] transition-colors">
                        <td className="py-3.5 pr-4 font-medium flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-sky-400 shrink-0" />
                          <span className="truncate">{summary.site}</span>
                        </td>
                        <td className="py-3.5 px-4 text-center tabular-nums">{summary.scheduled}</td>
                        <td className="py-3.5 px-4 text-center tabular-nums text-emerald-400">{summary.present}</td>
                        <td className="py-3.5 px-4 text-center tabular-nums text-amber-400">{summary.late}</td>
                        <td className="py-3.5 px-4 text-center tabular-nums text-rose-500">{summary.missed}</td>
                        <td className="py-3.5 pl-4 text-right font-semibold text-blue-400">{summary.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Leave Statistics Card */}
          <Card className="border-[#1f2432] bg-[#11141d] shadow-md">
            <CardHeader className="border-b border-[#1f2432] pb-4">
              <div className="space-y-1">
                <CardTitle className="text-lg font-bold text-foreground">Leave Requests Statistics</CardTitle>
                <CardDescription className="text-xs text-muted-foreground">Monthly summary of leave applications and their current status breakdown.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-6">
                {/* Horizontal Progress bar stack */}
                <div className="flex h-3 w-full overflow-hidden rounded-full bg-[#1c2130]">
                  <div className="bg-amber-500" style={{ width: '35%' }} title="Pending: 35%" />
                  <div className="bg-emerald-500" style={{ width: '55%' }} title="Approved: 55%" />
                  <div className="bg-rose-500" style={{ width: '10%' }} title="Rejected: 10%" />
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  {leaveStats.map((stat) => (
                    <div key={stat.label} className="rounded-xl border border-[#1f2432] bg-[#161a25]/40 p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">{stat.label}</span>
                        <span className={cn('text-sm font-bold', stat.textColor)}>{stat.percentage}%</span>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-extrabold text-foreground">{stat.count}</span>
                        <span className="text-xs text-muted-foreground">requests</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Activity Feed & Calendar (Span 1) */}
        <div className="space-y-6">
          {/* Recent Activity / Audit Log Card */}
          <Card className="border-[#1f2432] bg-[#11141d] shadow-md">
            <CardHeader className="border-b border-[#1f2432] pb-4">
              <div className="space-y-1">
                <CardTitle className="text-lg font-bold text-foreground">Recent HR Activity</CardTitle>
                <CardDescription className="text-xs text-muted-foreground">Latest actions and alerts registered in the HR system.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-4">
                {activities.map((activity) => (
                  <div key={activity.id} className="flex items-start gap-3 text-sm pb-3 border-b border-[#1f2432]/40 last:border-0 last:pb-0">
                    <div className="mt-0.5 rounded-full bg-slate-800 p-1.5 shrink-0 text-slate-400">
                      <Clock className="h-3.5 w-3.5" />
                    </div>
                    <div className="space-y-1 min-w-0">
                      <p className="font-semibold text-foreground truncate">
                        {activity.user}{' '}
                        <span className="font-normal text-muted-foreground">{activity.action}</span>
                      </p>
                      <p className="text-xs text-muted-foreground/80">{activity.detail}</p>
                      <span className="text-[10px] text-muted-foreground/60 block">{activity.time}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Upcoming Holidays & Events Card */}
          <Card className="border-[#1f2432] bg-[#11141d] shadow-md">
            <CardHeader className="border-b border-[#1f2432] pb-4">
              <div className="space-y-1">
                <CardTitle className="text-lg font-bold text-foreground">Upcoming Holidays & Events</CardTitle>
                <CardDescription className="text-xs text-muted-foreground">National holidays and important events for workforce planning.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-4">
                {upcomingHolidays.map((holiday, idx) => (
                  <div key={idx} className="flex items-center justify-between gap-4 p-3 rounded-lg border border-[#1f2432]/60 bg-[#161a25]/20 hover:border-[#1f2432] transition-colors">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                        <p className="font-semibold text-foreground text-xs truncate">{holiday.name}</p>
                      </div>
                      <p className="text-[11px] text-muted-foreground">{holiday.date}</p>
                    </div>
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 shrink-0">
                      {holiday.daysRemaining}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
