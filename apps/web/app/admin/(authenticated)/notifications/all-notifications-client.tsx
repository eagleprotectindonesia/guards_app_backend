'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { cn } from '@repo/shared';
import {
  AlertTriangle,
  Bell,
  Calendar,
  ClipboardList,
  Ticket,
  Eye,
  Search,
  X,
  ArrowLeft,
  ExternalLink,
  Circle,
  Trash2,
} from 'lucide-react';
import { useNotificationsDropdown } from '../context/notifications-dropdown-context';
import type { AlertWithRelations } from '../context/alert-context';
import { NotificationTypePill } from '../components/notification-type-pill';
import {
  categorizeItem,
  buildNotificationRowFromAdminNotification,
  buildNotificationRowFromAlert,
  sortByAlertPriority,
  type UnifiedNotificationItem,
} from '../components/notification-row';
import { useSocket } from '@/components/socket-provider';
import { formatDateTime } from '@/lib/format-relative-time';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type TabId = 'all' | 'unread' | 'critical_alert' | 'calendar' | 'ticket' | 'leave';

const TABS: { id: TabId; label: string; icon: typeof Bell }[] = [
  { id: 'all', label: 'All', icon: Bell },
  { id: 'unread', label: 'Unread', icon: Eye },
  { id: 'critical_alert', label: 'Critical Alert', icon: AlertTriangle },
  { id: 'calendar', label: 'Calendar', icon: Calendar },
  { id: 'ticket', label: 'Ticket', icon: Ticket },
  { id: 'leave', label: 'Leave & HR', icon: ClipboardList },
];

const DATE_RANGES = [
  { value: '1d', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'all', label: 'All time' },
];

function getPriorityLabel(tag: string): string {
  if (tag === 'Critical') return 'Critical';
  if (tag === 'Warning') return 'Warning';
  return 'Normal';
}

function getPriorityColor(tag: string): string {
  if (tag === 'Critical') return 'text-red-600 bg-red-100 dark:bg-red-900/30 border-red-200 dark:border-red-800';
  if (tag === 'Warning')
    return 'text-amber-600 bg-amber-100 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800';
  return 'text-muted-foreground bg-muted border-border';
}

function getModuleLabel(item: UnifiedNotificationItem): string {
  if (item.kind === 'alert') return 'Alerts';
  if (item.tag === 'Calendar') return 'Calendar';
  if (item.tag === 'Ticket' || item.tag === 'Message') return 'Tickets & Messages';
  if (item.tag === 'Leave') return 'Leave & HR';
  return 'Other';
}

function getActionLabel(item: UnifiedNotificationItem): string {
  if (item.kind === 'alert') return 'View Alert';
  if (item.tag === 'Calendar') return 'View Event';
  if (item.tag === 'Ticket' || item.tag === 'Message') return 'View Ticket';
  if (item.tag === 'Leave') return 'View Leave';
  return 'View';
}

function isItemUnread(item: UnifiedNotificationItem): boolean {
  return item.kind === 'notification' ? !item.readAt : true;
}

export default function AllNotificationsClient() {
  const { items, unreadCount, isInitialized, markAllAsRead, markReadById } = useNotificationsDropdown();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const activeTab = (searchParams.get('tab') as TabId) || 'all';
  const selectedId = searchParams.get('item') || null;

  const queryClient = useQueryClient();
  const { socket } = useSocket();

  const [dateRange, setDateRange] = useState('30d');
  const [typeFilter, setTypeFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const { data: fetchedData, isFetching } = useQuery({
    queryKey: ['admin', 'notifications', 'items', dateRange],
    queryFn: async () => {
      const res = await fetch(`/api/admin/notifications?range=${dateRange}`);
      if (!res.ok) throw new Error('Failed to fetch notifications');
      const json = await res.json();
      const notificationItems: UnifiedNotificationItem[] = json.notifications.map(
        buildNotificationRowFromAdminNotification
      );
      const alertItems: UnifiedNotificationItem[] = json.alerts.map((a: AlertWithRelations) =>
        buildNotificationRowFromAlert(a, '/admin/alerts')
      );
      return [...notificationItems, ...alertItems].sort(sortByAlertPriority);
    },
    staleTime: 30000,
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (!socket) return;
    const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'notifications'] });
    socket.on('admin_notification_created', invalidate);
    socket.on('admin_notifications_read', invalidate);
    return () => {
      socket.off('admin_notification_created', invalidate);
      socket.off('admin_notifications_read', invalidate);
    };
  }, [socket, queryClient]);

  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: 0,
      unread: 0,
      critical_alert: 0,
      calendar: 0,
      ticket: 0,
      leave: 0,
    };
    for (const item of items) {
      const isUnread = isItemUnread(item);
      const cat = categorizeItem(item);
      if (cat === 'critical_alert') {
        counts.critical_alert++;
        counts.all++;
      } else if (isUnread) {
        counts.unread++;
        counts.all++;
        if (cat !== 'other') counts[cat]++;
      }
    }
    return counts;
  }, [items]);

  const filteredItems = useMemo(() => {
    let result = fetchedData ?? [];

    if (activeTab === 'unread') {
      result = result.filter(isItemUnread);
    } else if (activeTab !== 'all') {
      result = result.filter(item => categorizeItem(item) === activeTab);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(item => item.title.toLowerCase().includes(q) || item.body.toLowerCase().includes(q));
    }

    if (typeFilter !== 'all') {
      result = result.filter(item => {
        if (typeFilter === 'alert' || typeFilter === 'critical' || typeFilter === 'warning') {
          if (item.kind !== 'alert') return false;
          if (typeFilter === 'critical') return item.tag === 'Critical';
          if (typeFilter === 'warning') return item.tag === 'Warning' || item.tag === 'Alert';
          return true;
        }
        if (typeFilter === 'calendar') return item.tag === 'Calendar';
        if (typeFilter === 'ticket') return item.tag === 'Ticket' || item.tag === 'Message';
        if (typeFilter === 'leave') return item.tag === 'Leave';
        return true;
      });
    }

    if (priorityFilter !== 'all') {
      result = result.filter(item => {
        if (priorityFilter === 'critical') return item.tag === 'Critical';
        if (priorityFilter === 'warning') return item.tag === 'Warning' || item.tag === 'Alert';
        return item.kind === 'notification';
      });
    }

    if (moduleFilter !== 'all') {
      result = result.filter(
        item =>
          getModuleLabel(item)
            .toLowerCase()
            .replace(/[^a-z]/g, '') === moduleFilter
      );
    }

    if (statusFilter === 'unread') {
      result = result.filter(isItemUnread);
    } else if (statusFilter === 'read') {
      result = result.filter(item => item.kind === 'notification' && item.readAt);
    }

    return result;
  }, [fetchedData, activeTab, searchQuery, typeFilter, priorityFilter, moduleFilter, statusFilter]);

  const selectedItem = useMemo(
    () => filteredItems.find(item => `${item.kind}-${item.id}` === selectedId) ?? null,
    [filteredItems, selectedId]
  );

  const updateParam = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set(key, value);
      else params.delete(key);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [searchParams, router, pathname]
  );

  const handleTabChange = (tab: TabId) => {
    const params = new URLSearchParams(searchParams.toString());
    if (tab === 'all') params.delete('tab');
    else params.set('tab', tab);
    params.delete('item');
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const handleSelectItem = (itemId: string) => {
    const next = itemId === selectedId ? null : itemId;
    updateParam('item', next);
    if (next) {
      const item = filteredItems.find(i => `${i.kind}-${i.id}` === itemId);
      if (item && item.kind === 'notification' && !item.readAt) {
        markReadById(item.id);
        queryClient.setQueryData<UnifiedNotificationItem[]>(['admin', 'notifications', 'items', dateRange], old => {
          if (!old) return old;
          return old.map(i =>
            i.kind === 'notification' && i.id === item.id ? { ...i, readAt: new Date().toISOString() } : i
          );
        });
      }
    }
  };

  const handleResetFilters = () => {
    setDateRange('30d');
    setTypeFilter('all');
    setPriorityFilter('all');
    setModuleFilter('all');
    setStatusFilter('all');
    setSearchQuery('');
  };

  const hasActiveFilters =
    dateRange !== '30d' ||
    typeFilter !== 'all' ||
    priorityFilter !== 'all' ||
    moduleFilter !== 'all' ||
    statusFilter !== 'all' ||
    searchQuery !== '';

  if (!isInitialized) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-foreground">Notification Center</h1>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={markAllAsRead}>
              Mark all as read
            </Button>
          )}
          <Button variant="outline" size="sm" disabled className="opacity-50 cursor-not-allowed">
            <Trash2 className="w-4 h-4 mr-1.5" />
            Delete Selected
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-0.5 mb-6 border-b">
        {TABS.map(tab => {
          const count = tabCounts[tab.id];
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTabChange(tab.id)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                isActive
                  ? 'border-red-500 text-red-600 dark:text-red-400'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30'
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
              {count > 0 && (
                <span
                  className={cn(
                    'ml-1 inline-flex items-center justify-center h-5 min-w-5 rounded-full px-1.5 text-xs font-semibold',
                    isActive
                      ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  {count > 99 ? '99+' : count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Select value={dateRange} onValueChange={setDateRange}>
          <SelectTrigger className="h-8 w-[140px] text-xs">
            <SelectValue placeholder="Date Range" />
          </SelectTrigger>
          <SelectContent>
            {DATE_RANGES.map(r => (
              <SelectItem key={r.value} value={r.value} className="text-xs">
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-8 w-[130px] text-xs">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">
              All Types
            </SelectItem>
            <SelectItem value="alert" className="text-xs">
              Alerts
            </SelectItem>
            <SelectItem value="critical" className="text-xs">
              Critical
            </SelectItem>
            <SelectItem value="warning" className="text-xs">
              Warning
            </SelectItem>
            <SelectItem value="calendar" className="text-xs">
              Calendar
            </SelectItem>
            <SelectItem value="ticket" className="text-xs">
              Tickets & Messages
            </SelectItem>
            <SelectItem value="leave" className="text-xs">
              Leave
            </SelectItem>
          </SelectContent>
        </Select>

        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="h-8 w-[130px] text-xs">
            <SelectValue placeholder="All Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">
              All Priority
            </SelectItem>
            <SelectItem value="critical" className="text-xs">
              Critical
            </SelectItem>
            <SelectItem value="warning" className="text-xs">
              Warning
            </SelectItem>
            <SelectItem value="normal" className="text-xs">
              Normal
            </SelectItem>
          </SelectContent>
        </Select>

        <Select value={moduleFilter} onValueChange={setModuleFilter}>
          <SelectTrigger className="h-8 w-[140px] text-xs">
            <SelectValue placeholder="All Modules" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">
              All Modules
            </SelectItem>
            <SelectItem value="alerts" className="text-xs">
              Alerts
            </SelectItem>
            <SelectItem value="calendar" className="text-xs">
              Calendar
            </SelectItem>
            <SelectItem value="tickets" className="text-xs">
              Tickets & Messages
            </SelectItem>
            <SelectItem value="leave" className="text-xs">
              Leave & HR
            </SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-[130px] text-xs">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">
              All Status
            </SelectItem>
            <SelectItem value="unread" className="text-xs">
              Unread
            </SelectItem>
            <SelectItem value="read" className="text-xs">
              Read
            </SelectItem>
          </SelectContent>
        </Select>

        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Search notifications..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full h-8 pl-8 pr-8 text-xs rounded-md border border-input bg-transparent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:border-ring focus-visible:ring-ring/50"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={handleResetFilters}>
            Reset
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        <div>
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            {isFetching && filteredItems.length > 0 && (
              <div className="px-4 py-1.5 text-xs text-muted-foreground bg-muted/20 border-b flex items-center gap-1.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                Updating...
              </div>
            )}
            {filteredItems.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                {!fetchedData || fetchedData.length === 0
                  ? 'No notifications yet.'
                  : 'No notifications match your filters.'}
              </div>
            ) : (
              <>
                <div className="hidden sm:grid grid-cols-[1fr_100px_90px_140px_60px_60px] gap-2 px-4 py-2 text-xs font-medium text-muted-foreground border-b bg-muted/30">
                  <div>Notification</div>
                  <div>Module</div>
                  <div>Priority</div>
                  <div>Date & Time</div>
                  <div>Status</div>
                  <div></div>
                </div>
                <div className="divide-y divide-border">
                  {filteredItems.map(item => {
                    const itemId = `${item.kind}-${item.id}`;
                    const isSelected = itemId === selectedId;
                    const unread = isItemUnread(item);

                    return (
                      <button
                        key={itemId}
                        type="button"
                        onClick={() => handleSelectItem(itemId)}
                        className={cn(
                          'w-full text-left grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_100px_90px_140px_60px_60px] gap-2 px-4 py-2.5 transition-colors hover:bg-muted/50',
                          isSelected && 'bg-primary/5 ring-1 ring-inset ring-primary/20',
                          unread && 'bg-primary/[0.02]'
                        )}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={cn('p-1 rounded-md shrink-0', item.iconBg)}>
                            <item.icon className={cn('w-3.5 h-3.5', item.iconColor)} />
                          </div>
                          <div className="min-w-0">
                            <p className={cn('text-sm truncate', unread ? 'font-semibold' : 'font-medium')}>
                              {item.title}
                            </p>
                            <p className="text-xs text-muted-foreground truncate sm:hidden">{item.body}</p>
                          </div>
                        </div>
                        <div className="hidden sm:flex items-center">
                          <NotificationTypePill tag={item.tag} />
                        </div>
                        <div className="hidden sm:flex items-center">
                          <span
                            className={cn(
                              'inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded border',
                              getPriorityColor(item.tag)
                            )}
                          >
                            {getPriorityLabel(item.tag)}
                          </span>
                        </div>
                        <div className="hidden sm:flex items-center text-xs text-muted-foreground">
                          {formatDateTime(item.createdAt)}
                        </div>
                        <div className="hidden sm:flex items-center">
                          {unread ? (
                            <Circle className="w-2.5 h-2.5 fill-primary text-primary" />
                          ) : (
                            <Circle className="w-2.5 h-2.5 text-muted-foreground/40" />
                          )}
                        </div>
                        <div className="hidden sm:flex items-center">
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              if (item.kind === 'notification' && !item.readAt) {
                                markReadById(item.id);
                                queryClient.setQueryData<UnifiedNotificationItem[]>(
                                  ['admin', 'notifications', 'items', dateRange],
                                  old => {
                                    if (!old) return old;
                                    return old.map(i =>
                                      i.kind === 'notification' && i.id === item.id
                                        ? { ...i, readAt: new Date().toISOString() }
                                        : i
                                    );
                                  }
                                );
                              }
                              router.push(item.targetPath);
                            }}
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            {getActionLabel(item)}
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        {selectedItem ? (
          <div className="hidden lg:block sticky top-6 self-start">
            <div className="bg-card border border-border rounded-xl p-5">
              <button
                type="button"
                onClick={() => updateParam('item', null)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-4"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to list
              </button>

              <div className="flex items-start gap-3 mb-4">
                <div className={cn('p-2 rounded-lg shrink-0', selectedItem.iconBg)}>
                  <selectedItem.icon className={cn('w-5 h-5', selectedItem.iconColor)} />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-foreground">{selectedItem.title}</h2>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{selectedItem.body}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 mb-4">
                <NotificationTypePill tag={selectedItem.tag} />
                <span
                  className={cn(
                    'inline-flex items-center px-2 py-0.5 text-xs font-medium rounded border',
                    getPriorityColor(selectedItem.tag)
                  )}
                >
                  {getPriorityLabel(selectedItem.tag)}
                </span>
              </div>

              <div className="space-y-2.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Module</span>
                  <span className="font-medium">{getModuleLabel(selectedItem)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Date & Time</span>
                  <span className="font-medium">{formatDateTime(selectedItem.createdAt)}</span>
                </div>
                {selectedItem.kind === 'alert' && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Guard</span>
                      <span className="font-medium">{selectedItem.body.split(' at ')[0]}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Site</span>
                      <span className="font-medium">{selectedItem.body.split(' at ')[1]?.replace('.', '') ?? '-'}</span>
                    </div>
                  </>
                )}
              </div>

              <div className="mt-5 pt-4 border-t">
                <p className="text-xs text-muted-foreground mb-1">Description</p>
                <p className="text-sm">{selectedItem.body}</p>
              </div>

              <a
                href={selectedItem.targetPath}
                className="mt-5 w-full inline-flex items-center justify-center gap-1.5 h-9 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                {getActionLabel(selectedItem)}
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>
        ) : (
          <div className="hidden lg:flex items-center justify-center h-64 bg-card border border-border rounded-xl">
            <div className="text-center">
              <Bell className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">Select a notification to view details</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
