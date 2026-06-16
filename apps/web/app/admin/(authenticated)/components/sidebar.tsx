'use client';

import { useMemo, useState, useEffect } from 'react';
import Image from 'next/image';
import { usePathname, useSearchParams } from 'next/navigation';
import { ChevronDown, ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { cn } from '@repo/shared';
import { getAdminNavGroups } from '@/lib/admin-navigation';
import { useSession } from '../context/session-context';
import { AdminNavLink } from './admin-nav-link';
import { useAdminNotifications } from '../context/admin-notification-context';
import { getAdminDashboardHref, getAdminTabFromPath } from '@/lib/admin-tab-routing';
import { useAdminDashboardTab } from '../context/admin-dashboard-tab-context';

type Props = {
  officeWorkSchedulesEnabled: boolean;
};

function DigitalClock({ isCollapsed }: { isCollapsed: boolean }) {
  const [time, setTime] = useState<Date | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);

    const timeout = setTimeout(() => {
      setTime(new Date());
    }, 0);

    return () => {
      clearInterval(timer);
      clearTimeout(timeout);
    };
  }, []);

  if (!time) return null;

  return (
    <div
      className={cn(
        'mt-auto p-3 border-t border-border bg-accent/5 transition-all duration-300',
        isCollapsed ? 'items-center px-0' : ''
      )}
    >
      <div className={cn('flex items-start gap-3', isCollapsed ? 'justify-center' : '')}>
        <div className="p-2 rounded-lg bg-accent/10 text-muted-foreground shrink-0">
          <Clock className="w-5 h-5" />
        </div>
        {!isCollapsed && (
          <div className="flex flex-col min-w-0">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              System Time
            </span>
            <div className="flex flex-wrap items-baseline gap-x-2 text-sm font-medium text-foreground/90 tabular-nums leading-tight mt-1">
              <span className="whitespace-nowrap">
                {time.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
              <span className="text-muted-foreground whitespace-nowrap">
                {time.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Sidebar({ officeWorkSchedulesEnabled }: Props) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeTab = getAdminTabFromPath(pathname);
  const { selectedTab } = useAdminDashboardTab();
  const { hasPermission } = useSession();
  const { unreadCount } = useAdminNotifications();
  const currentUrl = searchParams.toString() ? `${pathname}?${searchParams.toString()}` : pathname;
  const [ticketCounters, setTicketCounters] = useState<{ all: number; acknowledged: number; unassigned: number; closed: number } | null>(null);

  useEffect(() => {
    if (!hasPermission('tickets:view')) return;

    let cancelled = false;
    const loadCounters = async () => {
      try {
        const response = await fetch('/api/admin/tickets/counters', { method: 'GET', cache: 'no-store' });
        if (!response.ok) return;
        const data = (await response.json()) as { all: number; my: number; unassigned: number; closed: number };
        if (!cancelled) {
          setTicketCounters(data);
        }
      } catch (error) {
        console.error('Failed to load ticket counters', error);
      }
    };

    void loadCounters();
    return () => {
      cancelled = true;
    };
  }, [hasPermission]);

  const navGroups = useMemo(() => {
    return getAdminNavGroups(officeWorkSchedulesEnabled, selectedTab)
      .map(group => ({
        ...group,
        items: group.items.filter(item => !item.requiredPermission || hasPermission(item.requiredPermission)),
      }))
      .filter(group => group.items.length > 0);
  }, [hasPermission, officeWorkSchedulesEnabled, selectedTab]);

  const isGroupCollapsed = (label: string) => collapsedGroups[label] ?? false;
  const ticketCounterByHref: Record<string, number | undefined> = {
    '/admin/ticket/all': ticketCounters?.all,
    '/admin/ticket/acknowledged': ticketCounters?.acknowledged,
    '/admin/ticket/unassigned': ticketCounters?.unassigned,
    '/admin/ticket/closed': ticketCounters?.closed,
  };

  return (
    <aside
      className={cn(
        'bg-card border-r border-border flex flex-col h-screen sticky top-0 transition-all duration-300 ease-in-out z-50 overflow-visible',
        isCollapsed ? 'w-20' : 'w-64'
      )}
    >
      {/* Logo */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-border relative group">
        <AdminNavLink
          href={getAdminDashboardHref(selectedTab)}
          className={cn(
            'flex items-center overflow-hidden transition-all duration-300',
            isCollapsed ? 'justify-center w-full' : 'w-full'
          )}
        >
          <div className={cn('relative h-10 transition-all duration-300', isCollapsed ? 'w-10' : 'w-48')}>
            <Image
              src="/eagle-protect-long-logo-red-black.svg"
              alt="Eagle Protect"
              fill
              className="object-contain object-left dark:hidden"
              priority
            />
            <Image
              src="/eagle-protect-long-logo-red-white.svg"
              alt="Eagle Protect"
              fill
              className="object-contain object-left hidden dark:block"
              priority
            />
          </div>
        </AdminNavLink>

        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className={cn(
            'p-2 rounded-full bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground transition-colors absolute -right-4 top-1/2 -translate-y-1/2 border border-border shadow-sm z-50'
          )}
        >
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-3 overflow-y-auto overflow-x-hidden">
        {navGroups.map(group => (
          <div key={group.label} className="space-y-2 rounded-xl border border-transparent">
            {!isCollapsed && (
              <button
                type="button"
                onClick={() =>
                  setCollapsedGroups(current => ({
                    ...current,
                    [group.label]: !(current[group.label] ?? false),
                  }))
                }
                className="flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left transition-colors hover:bg-accent/50"
                aria-expanded={!isGroupCollapsed(group.label)}
              >
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/80">
                  {group.label}
                </span>
                <ChevronDown
                  className={cn(
                    'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
                    isGroupCollapsed(group.label) && '-rotate-90'
                  )}
                />
              </button>
            )}

            {!isCollapsed && !isGroupCollapsed(group.label) && (
              <div className="space-y-1">
                {group.items.map(item => {
                  const isActive = item.href.includes('?')
                    ? currentUrl === item.href
                    : pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const showLeaveRequestsCounter = item.href === '/admin/leave-requests' && unreadCount > 0;
                  const ticketCounter = ticketCounterByHref[item.href];
                  const showTicketCounter = typeof ticketCounter === 'number' && ticketCounter > 0;

                  return (
                    <AdminNavLink
                      key={item.name}
                      href={item.href}
                      title={isCollapsed ? item.name : undefined}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                        isActive
                          ? routeTab === 'ticket'
                            ? 'bg-purple-500/10 text-purple-400 dark:bg-purple-950/30 dark:text-purple-400 border border-purple-500/20'
                            : 'bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400'
                          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                        isCollapsed && 'justify-center px-2'
                      )}
                    >
                      <item.icon
                        className={cn(
                          'w-5 h-5 shrink-0',
                          isActive
                          ? routeTab === 'ticket'
                              ? 'text-purple-400'
                              : 'text-red-600 dark:text-red-400'
                            : 'text-muted-foreground'
                        )}
                      />
                      <span
                        className={cn(
                          'transition-opacity duration-300 whitespace-nowrap',
                          isCollapsed && 'opacity-0 w-0 hidden'
                        )}
                      >
                        {item.name}
                      </span>
                      {showLeaveRequestsCounter && (
                        <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
                          {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                      )}
                      {showTicketCounter && (
                        <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-xs font-semibold text-white">
                          {ticketCounter! > 99 ? '99+' : ticketCounter}
                        </span>
                      )}
                    </AdminNavLink>
                  );
                })}
              </div>
            )}

            {!isCollapsed && isGroupCollapsed(group.label) && (
              <div className="h-px bg-border/60 mx-3" aria-hidden="true" />
            )}

            {isCollapsed && (
              <div className="space-y-1">
                {group.items.map(item => {
                  const isActive = item.href.includes('?')
                    ? currentUrl === item.href
                    : pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const showLeaveRequestsCounter = item.href === '/admin/leave-requests' && unreadCount > 0;
                  const ticketCounter = ticketCounterByHref[item.href];
                  const showTicketCounter = typeof ticketCounter === 'number' && ticketCounter > 0;

                  return (
                    <AdminNavLink
                      key={item.name}
                      href={item.href}
                      title={item.name}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors justify-center px-2',
                        isActive
                          ? routeTab === 'ticket'
                            ? 'bg-purple-500/10 text-purple-400 dark:bg-purple-950/30 dark:text-purple-400 border border-purple-500/20'
                            : 'bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400'
                          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                      )}
                    >
                      <item.icon
                        className={cn(
                          'w-5 h-5 shrink-0',
                          isActive
                            ? routeTab === 'ticket'
                              ? 'text-purple-400'
                              : 'text-red-600 dark:text-red-400'
                            : 'text-muted-foreground'
                        )}
                      />
                      {showLeaveRequestsCounter && (
                        <span className="absolute -top-1.5 -right-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                          {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                      )}
                      {showTicketCounter && (
                        <span className="absolute -top-1.5 -right-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
                          {ticketCounter! > 99 ? '99+' : ticketCounter}
                        </span>
                      )}
                      <span className="opacity-0 w-0 hidden">{item.name}</span>
                    </AdminNavLink>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </nav>

      <DigitalClock isCollapsed={isCollapsed} />
    </aside>
  );
}
