'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ADMIN_NAV_ITEMS, ADMIN_SECONDARY_NAV_ITEMS } from '@/lib/admin-navigation';
import { useSession } from '../context/session-context';

export default function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const pathname = usePathname();
  const { hasPermission } = useSession();

  const filteredNavItems = ADMIN_NAV_ITEMS.filter(
    item => !item.requiredPermission || hasPermission(item.requiredPermission)
  );

  const filteredSecondaryNavItems = ADMIN_SECONDARY_NAV_ITEMS.filter(
    item => !item.requiredPermission || hasPermission(item.requiredPermission)
  );

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
              src="/eagle-protect-long-logo-red-white.svg"
              alt="Eagle Protect"
              fill
              className="object-contain object-left dark:brightness-110"
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
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto overflow-x-hidden">
        {filteredNavItems.map(item => {
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

        {filteredSecondaryNavItems.map(item => {
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
      </nav>
    </aside>
  );
}
