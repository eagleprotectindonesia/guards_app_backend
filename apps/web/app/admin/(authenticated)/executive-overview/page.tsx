import React from 'react';
import { getExecutiveOverviewMetrics } from '@repo/database';
import { requirePermission } from '@/lib/admin-auth';
import { CompanyStatusCard } from './components/company-status-card';
import { TotalEmployeesCard } from './components/total-employees-card';
import { ActiveGuardsCard } from './components/active-guards-card';
import { ActiveSitesCard } from './components/active-sites-card';
import { OpenTicketsCard } from './components/open-tickets-card';
import { SystemStatusCard } from './components/system-status-card';
import { WorkforceBreakdownCard } from './components/workforce-breakdown-card';
import { GuardActivityTodayCard } from './components/guard-activity-today-card';
import { TodayOperationsSummaryCard } from './components/today-operations-summary-card';
import { CheckInPerformanceCard } from './components/check-in-performance-card';
import { PatrolCompletionCard } from './components/patrol-completion-card';
import { CommunicationSummaryCard } from './components/communication-summary-card';
import { TodaysHighlightsCard } from './components/todays-highlights-card';
import { OpenAlertsCard } from './components/open-alerts-card';
import { TicketSlaCard } from './components/ticket-sla-card';

export const dynamic = 'force-dynamic';

export default async function ExecutiveOverviewPage() {
  await requirePermission('dashboard-executive:view');

  const metrics = await getExecutiveOverviewMetrics();
  const { totalEmployees, activeSites, totalSites, activeGuardsOnDuty, scheduledShiftsToday, openTickets, workforceBreakdown, guardActivityToday, todayOperationsSummary, patrolCompletion, communicationSummary, highlights, openAlerts, ticketSla } = metrics;

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
        <CompanyStatusCard />
        <TotalEmployeesCard total={totalEmployees} />
        <ActiveGuardsCard activeGuardsOnDuty={activeGuardsOnDuty} scheduledShiftsToday={scheduledShiftsToday} />
        <ActiveSitesCard activeSites={activeSites} totalSites={totalSites} />
        <OpenTicketsCard {...openTickets} />
        <SystemStatusCard />
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <WorkforceBreakdownCard {...workforceBreakdown} />
        <GuardActivityTodayCard {...guardActivityToday} />
        <TodayOperationsSummaryCard {...todayOperationsSummary} />
        <CheckInPerformanceCard {...guardActivityToday} />
        <PatrolCompletionCard {...patrolCompletion} />
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <CommunicationSummaryCard {...communicationSummary} />
        <OpenAlertsCard {...openAlerts} />
        <TodaysHighlightsCard highlights={highlights} />
        <TicketSlaCard {...ticketSla} />
      </div>
    </div>
  );
}
