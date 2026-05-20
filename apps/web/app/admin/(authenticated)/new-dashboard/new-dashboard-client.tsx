'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, Building2, SendHorizontal, ShieldCheck, User, UserCheck, Users } from 'lucide-react';
import { format, isToday } from 'date-fns';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ChatInboxItem } from '@repo/types';
import { useAlerts } from '../context/alert-context';
import { useNewDashboardStream, type NewDashboardAlert } from '../context/new-dashboard-stream-context';
import { LoadingBlock } from '../components/loading/loading-block';
import { NewDashboardSkeleton } from '../components/loading/new-dashboard-skeleton';
import { useSession } from '../context/session-context';
import { useAdminUnifiedChatInbox } from '@/hooks/use-admin-unified-chat-inbox';
import { buildConversationUrl, type ConversationSelection } from '@/lib/chat/conversation-selection';

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
  return (
    <div className={`rounded-xl border border-border bg-card p-4 shadow-sm ${className}`}>
      <LoadingBlock className="h-full w-full" />
    </div>
  );
}

function severityBadgeClass(alert: NewDashboardAlert): string {
  if (alert.severity === 'critical') {
    return 'bg-red-500/15 text-red-600 dark:text-red-400';
  }
  return 'bg-amber-500/15 text-amber-600 dark:text-amber-400';
}

function severityLabel(alert: NewDashboardAlert): string {
  if (alert.severity === 'critical') return 'High';
  if (alert.status === 'need_attention') return 'Medium';
  return 'Low';
}

function reasonLabel(alert: NewDashboardAlert): string {
  return alert.reason.replace(/_/g, ' ');
}

function guardSiteLabel(alert: NewDashboardAlert): string {
  const guardName = alert.shift?.employee?.fullName || 'Unassigned Guard';
  const siteName = alert.site?.name || 'Unknown Site';
  return `${guardName} - ${siteName}`;
}

function CriticalAlertsCard() {
  const { criticalAlerts } = useNewDashboardStream();

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm h-100">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Critical Alerts</h3>
        <Link href="/admin/alerts" className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400">
          View All
        </Link>
      </div>

      {(criticalAlerts.status === 'loading' || criticalAlerts.status === 'idle') &&
        criticalAlerts.data.length === 0 && (
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

      {criticalAlerts.status === 'ready' && criticalAlerts.data.length === 0 && (
        <div className="h-[calc(100%-2.5rem)] flex items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
          No active alerts
        </div>
      )}

      {criticalAlerts.data.length > 0 && (
        <div className="space-y-3">
          {criticalAlerts.data.map(alert => (
            <div key={alert.id} className="rounded-lg border border-border bg-muted/15 p-3">
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

              <div className="text-sm font-medium text-foreground truncate">{guardSiteLabel(alert)}</div>

              <div className="mt-1 text-xs text-muted-foreground">{format(new Date(alert.createdAt), 'hh:mm a')}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ShiftOverviewCard() {
  const { shiftOverview } = useNewDashboardStream();

  if (shiftOverview.status === 'idle' || shiftOverview.status === 'loading') {
    return (
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
    );
  }

  const data = shiftOverview.data;
  const total = Math.max(data.total, 0);
  const onDutyPct = total > 0 ? (data.onDuty / total) * 100 : 0;
  const upcomingPct = total > 0 ? (data.upcoming / total) * 100 : 0;
  const completedPct = total > 0 ? (data.completed / total) * 100 : 0;
  const donutBackground =
    total > 0
      ? `conic-gradient(
        #22c55e 0% ${onDutyPct}%,
        #3b82f6 ${onDutyPct}% ${onDutyPct + upcomingPct}%,
        #94a3b8 ${onDutyPct + upcomingPct}% ${onDutyPct + upcomingPct + completedPct}%,
        #ef4444 ${onDutyPct + upcomingPct + completedPct}% 100%
      )`
      : 'conic-gradient(#334155 0% 100%)';

  const legend = [
    { label: 'On Duty', count: data.onDuty, color: 'bg-green-500' },
    { label: 'Upcoming', count: data.upcoming, color: 'bg-blue-500' },
    { label: 'Completed', count: data.completed, color: 'bg-slate-400' },
    { label: 'Absent', count: data.absent, color: 'bg-red-500' },
  ];

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-foreground">Shift Overview</h3>
      <div className="mt-5 flex justify-center">
        <div
          className="relative flex h-44 w-44 items-center justify-center rounded-full"
          style={{ background: donutBackground }}
        >
          <div className="flex h-30 w-30 flex-col items-center justify-center rounded-full bg-card text-center">
            <p className="text-4xl font-bold text-foreground">{total}</p>
            <p className="text-sm text-muted-foreground">Total Shifts</p>
          </div>
        </div>
      </div>
      <div className="mt-5 space-y-2">
        {legend.map(item => (
          <div key={item.label} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${item.color}`} />
              <span className="text-sm text-muted-foreground">{item.label}</span>
            </div>
            <span className="text-sm font-semibold text-foreground">{item.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function InternalChatLiveCard() {
  const router = useRouter();
  const { userId, hasPermission } = useSession();
  const canViewChat = hasPermission('chat:view');

  const unifiedChat = useAdminUnifiedChatInbox({
    isChatVisible: false,
    currentAdminId: userId,
  });

  const topItems = useMemo(() => unifiedChat.items.slice(0, 4), [unifiedChat.items]);
  const [selectedConversation, setSelectedConversation] = useState<ConversationSelection>(null);

  const selectedItem = useMemo(() => {
    if (!selectedConversation) return null;
    return (
      topItems.find(item => item.kind === selectedConversation.kind && item.id === selectedConversation.id) ?? null
    );
  }, [selectedConversation, topItems]);

  const openSelectedConversation = () => {
    if (!selectedConversation) return;
    router.push(buildConversationUrl(selectedConversation));
  };

  const renderSubtitle = (item: ChatInboxItem) => {
    if (item.kind === 'direct') {
      return item.lastMessage ? `${item.lastMessage.senderName}: ${item.lastMessage.content}` : 'No messages yet';
    }

    return (
      item.subtitle ||
      (item.lastMessage ? `${item.lastMessage.senderName}: ${item.lastMessage.content}` : null) ||
      'No group messages yet'
    );
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm h-90 flex flex-col">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Internal Chat (Live)</h3>
        <Link href="/admin/chat" className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400">
          See All
        </Link>
      </div>

      {!canViewChat && (
        <div className="flex-1 flex items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
          No chat access
        </div>
      )}

      {canViewChat && unifiedChat.isLoading && topItems.length === 0 && (
        <div className="flex-1 space-y-4 overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3">
              <LoadingBlock className="h-8 w-8 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="flex justify-between">
                  <LoadingBlock className="h-3 w-20" />
                  <LoadingBlock className="h-2 w-12" />
                </div>
                <LoadingBlock className="h-3 w-full" />
              </div>
            </div>
          ))}
        </div>
      )}

      {canViewChat && !unifiedChat.isLoading && topItems.length === 0 && (
        <div className="flex-1 flex items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
          No conversations yet
        </div>
      )}

      {canViewChat && topItems.length > 0 && (
        <>
          <div className="flex-1 space-y-2 overflow-y-auto pr-1">
            {topItems.map(item => {
              const isSelected = selectedConversation?.kind === item.kind && selectedConversation.id === item.id;
              const timestamp = item.lastMessage?.createdAt
                ? (() => {
                    const date = new Date(item.lastMessage.createdAt);
                    return isToday(date) ? format(date, 'hh:mm a') : format(date, 'MMM d');
                  })()
                : '';
              return (
                <button
                  key={`${item.kind}:${item.id}`}
                  type="button"
                  onClick={() => setSelectedConversation({ kind: item.kind, id: item.id })}
                  className={`w-full rounded-lg border p-2.5 text-left transition-colors ${
                    isSelected ? 'border-blue-500/60 bg-blue-500/10' : 'border-border bg-muted/10 hover:bg-muted/20'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <div
                      className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                        item.kind === 'group'
                          ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                          : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      {item.kind === 'group' ? <Users className="h-4 w-4" /> : <User className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-foreground">{item.title}</p>
                        <div className="flex items-center gap-1.5">
                          {timestamp && <span className="shrink-0 text-[10px] text-muted-foreground">{timestamp}</span>}
                          {item.unreadCount > 0 && (
                            <span className="min-w-5 rounded-full bg-red-500 px-1.5 py-0.5 text-center text-[10px] font-bold text-white">
                              {item.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{renderSubtitle(item)}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {selectedItem && (
            <button
              type="button"
              onClick={openSelectedConversation}
              className="mt-3 flex h-10 w-full items-center justify-between rounded-lg border border-border bg-muted/15 px-3 text-sm text-muted-foreground hover:bg-muted/25"
            >
              <span className="truncate">Type a message...</span>
              <SendHorizontal className="h-4 w-4 shrink-0" />
            </button>
          )}
        </>
      )}
    </div>
  );
}

export default function NewDashboardClient() {
  const { activeSites, isDashboardInitialized } = useAlerts();

  if (!isDashboardInitialized) {
    return <NewDashboardSkeleton />;
  }

  const activeSitesCount = activeSites.length;
  const onDutyCount = activeSites.reduce(
    (acc, site) =>
      acc +
      site.shifts.filter(shift => shift.employee && shift.attendance && shift.attendance.status !== 'absent').length,
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
          <ShiftOverviewCard />

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
          <CriticalAlertsCard />
          <InternalChatLiveCard />
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
