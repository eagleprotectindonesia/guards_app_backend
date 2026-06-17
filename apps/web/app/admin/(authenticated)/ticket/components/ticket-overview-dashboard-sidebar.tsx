import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Clock3, CircleCheckBig, FileStack, Inbox, Plus } from 'lucide-react';
import { buildConicGradient, CATEGORY_COLORS } from './ticket-overview-dashboard.utils';
import type { TicketOverviewSidebar } from './ticket-overview-dashboard.types';

type Props = {
  sidebar: TicketOverviewSidebar;
};

function SidebarSectionTitle({ children }: { children: string }) {
  return <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{children}</h2>;
}

function DonutChart({ total, label, background }: { total: number; label: string; background: string }) {
  return (
    <div className="flex justify-center">
      <div className="relative flex h-32 w-32 items-center justify-center rounded-full" style={{ background }}>
        <div className="flex h-20 w-20 flex-col items-center justify-center rounded-full bg-card text-center">
          <p className="text-2xl font-bold tracking-tight text-foreground">{total}</p>
          <p className="text-[10px] text-muted-foreground">{label}</p>
        </div>
      </div>
    </div>
  );
}

export function TicketOverviewSidebarPanel({ sidebar }: Props) {
  const shortcutItems = [
    {
      label: 'Create New Ticket',
      icon: Plus,
      href: '/admin/ticket/create',
    },
    {
      label: 'Acknowledged',
      value: sidebar.shortcuts.acknowledged,
      icon: FileStack,
      href: '/admin/ticket/acknowledged',
    },
    {
      label: 'Unassigned Tickets',
      value: sidebar.shortcuts.unassigned,
      icon: Inbox,
      href: '/admin/ticket/unassigned',
    },
    {
      label: 'SLA Breached',
      value: sidebar.shortcuts.slaBreached,
      icon: Clock3,
      href: '/admin/ticket/dashboard?sla=breached',
    },
    {
      label: "Today's Resolved",
      value: sidebar.shortcuts.resolvedToday,
      icon: CircleCheckBig,
    },
  ];

  return (
    <div className="space-y-4">
      <Card className="border-border/60 bg-card p-4 shadow-md">
        <SidebarSectionTitle>Ticket Shortcuts</SidebarSectionTitle>
        <div className="mt-3 space-y-1.5">
          {shortcutItems.map(item => {
            const Icon = item.icon;
            const content = (
              <>
                <span className={`flex items-center gap-3 text-sm text-foreground ${item.href ? 'font-medium' : ''}`}>
                  <span className="rounded-lg border border-border/40 bg-muted p-1 text-muted-foreground">
                    <Icon className="h-4 w-4" />
                  </span>
                  {item.label}
                </span>
                {item.value !== undefined && item.value > 0 && (
                  <span className="inline-flex min-w-8 justify-center rounded-full bg-rose-500 px-2 py-0.5 text-xs font-semibold text-white">
                    {item.value}
                  </span>
                )}
              </>
            );

            const className = item.href
              ? 'flex items-center justify-between rounded-xl border border-border/40 bg-background/50 px-3 py-2 text-sm transition-colors hover:bg-accent'
              : 'flex items-center justify-between rounded-xl border border-border/40 bg-background/30 px-3 py-2 text-sm';

            if (item.href) {
              return (
                <Link key={item.label} href={item.href} className={className}>
                  {content}
                </Link>
              );
            }

            return (
              <div key={item.label} className={className}>
                {content}
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="border-border/60 bg-card p-4 shadow-md">
        <SidebarSectionTitle>Tickets By Category</SidebarSectionTitle>
        <div className="mt-3 space-y-3">
          <DonutChart
            total={sidebar.slaStatus.total}
            label="Total"
            background={buildConicGradient(
              sidebar.categories.map((item, index) => ({
                value: item.count,
                color: CATEGORY_COLORS[index % CATEGORY_COLORS.length]!,
              }))
            )}
          />
          <div className="space-y-2">
            {sidebar.categories.map((item, index) => (
              <div key={item.value} className="flex items-center justify-between gap-3 text-sm">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: CATEGORY_COLORS[index % CATEGORY_COLORS.length] }}
                  />
                  <span className="truncate text-muted-foreground">{item.label}</span>
                </div>
                <span className="shrink-0 font-medium text-foreground">
                  {item.count} ({item.percentage}%)
                </span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <Card className="border-border/60 bg-card p-4 shadow-md">
        <SidebarSectionTitle>SLA Status</SidebarSectionTitle>
        <div className="mt-3 space-y-3">
          <DonutChart
            total={sidebar.slaStatus.metPercentage}
            label="Met %"
            background={buildConicGradient([
              { value: sidebar.slaStatus.met, color: '#22c55e' },
              { value: sidebar.slaStatus.pending, color: '#f59e0b' },
              { value: sidebar.slaStatus.breached, color: '#ef4444' },
            ])}
          />
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
                <span className="text-muted-foreground">Met</span>
              </div>
              <span className="font-medium text-foreground">{sidebar.slaStatus.met}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                <span className="text-muted-foreground">Pending</span>
              </div>
              <span className="font-medium text-foreground">{sidebar.slaStatus.pending}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                <span className="text-muted-foreground">Breached</span>
              </div>
              <span className="font-medium text-foreground">{sidebar.slaStatus.breached}</span>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
