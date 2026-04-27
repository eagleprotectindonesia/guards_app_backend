'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@repo/shared';
import { ADMIN_SECONDARY_NAV_ITEMS, getAdminNavItems, type NavItem } from '@/lib/admin-navigation';
import { useSession } from '../context/session-context';

type Props = {
  officeWorkSchedulesEnabled: boolean;
};

export default function Sidebar({ officeWorkSchedulesEnabled }: Props) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const pathname = usePathname();
  const { hasPermission } = useSession();

  const navGroups = useMemo(() => {
    const navItems = getAdminNavItems(officeWorkSchedulesEnabled);
    const byName = new Map(navItems.map(item => [item.name, item]));

    const groups: Array<{ label: string; items: NavItem[] }> = [
      { label: 'Dashboard', items: [byName.get('Dashboard')].filter(Boolean) as NavItem[] },
      {
        label: 'Office',
        items: [
          byName.get('Offices'),
          byName.get('Office Schedules'),
          byName.get('Office Shift Types'),
          byName.get('Office Shifts'),
        ].filter(Boolean) as NavItem[],
      },
      {
        label: 'Guard',
        items: [
          byName.get('Sites'),
          byName.get('Guard Shift Types'),
          byName.get('Guard Shifts'),
          byName.get('Guard Checkins'),
          byName.get('Alerts'),
          byName.get('Chat'),
        ].filter(Boolean) as NavItem[],
      },
      {
        label: 'Employee Management',
        items: [
          byName.get('Employees'),
          byName.get('Attendance'),
          byName.get('Holiday Calendar'),
          byName.get('Leave Requests'),
          byName.get('Office Memos'),
        ].filter(Boolean) as NavItem[],
      },
      {
        label: 'System',
        items: ADMIN_SECONDARY_NAV_ITEMS,
      },
    ];

    return groups
      .map(group => ({
        ...group,
        items: group.items.filter(item => !item.requiredPermission || hasPermission(item.requiredPermission)),
      }))
      .filter(group => group.items.length > 0);
  }, [hasPermission, officeWorkSchedulesEnabled]);

  const isGroupCollapsed = (label: string) => collapsedGroups[label] ?? false;

  return (
    <aside
      className={cn(
        'bg-card border-r border-border flex flex-col h-screen sticky top-0 transition-all duration-300 ease-in-out z-50 overflow-visible',
        isCollapsed ? 'w-20' : 'w-64'
      )}
    >
      {/* Logo */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-border relative group">
        <Link
          href="/admin/dashboard"
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
        </Link>

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
                  const isActive = pathname.startsWith(item.href);

                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      title={isCollapsed ? item.name : undefined}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400'
                          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                        isCollapsed && 'justify-center px-2'
                      )}
                    >
                      <item.icon
                        className={cn(
                          'w-5 h-5 shrink-0',
                          isActive ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'
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
                    </Link>
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
                  const isActive = pathname.startsWith(item.href);

                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      title={item.name}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors justify-center px-2',
                        isActive
                          ? 'bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400'
                          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                      )}
                    >
                      <item.icon
                        className={cn(
                          'w-5 h-5 shrink-0',
                          isActive ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'
                        )}
                      />
                      <span className="opacity-0 w-0 hidden">{item.name}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </nav>
    </aside>
  );
}
