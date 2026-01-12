'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import {
  LogOut,
  ChevronLeft,
  ChevronRight,
  User,
} from 'lucide-react';
import { Admin } from '@prisma/client';
import { cn } from '@/lib/utils';
import { ADMIN_NAV_ITEMS, ADMIN_SECONDARY_NAV_ITEMS } from '@/lib/admin-navigation';

type SidebarProps = {
  currentAdmin: Admin | null;
};

export default function Sidebar({ currentAdmin }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
      });
      router.push('/admin/login');
      router.refresh();
    } catch (error) {
      console.error('Logout failed:', error);
    }
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
        {ADMIN_NAV_ITEMS.map(item => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.name}
              href={item.href}
              title={isCollapsed ? item.name : undefined}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                isActive ? 'bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                isCollapsed && 'justify-center px-2'
              )}
            >
              <item.icon className={cn('w-5 h-5 shrink-0', isActive ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground')} />
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

        {ADMIN_SECONDARY_NAV_ITEMS.filter(item => !item.role || item.role === currentAdmin?.role).map(item => {
          const isActive = pathname.startsWith(item.href);
          const isProfile = item.href.includes('profile');
          
          if (isProfile) return null; // Handle profile separately if desired, or just let it flow

          return (
            <Link
              key={item.name}
              href={item.href}
              title={isCollapsed ? item.name : undefined}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                isActive ? 'bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                isCollapsed && 'justify-center px-2'
              )}
            >
              <item.icon className={cn('w-5 h-5 shrink-0', isActive ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground')} />
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

        <div className="pt-4 mt-4 border-t border-border">
          <Link
            href="/admin/profile"
            title={isCollapsed ? 'Profile' : undefined}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
              pathname.startsWith('/admin/profile')
                ? 'bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              isCollapsed && 'justify-center px-2'
            )}
          >
            <User className="w-5 h-5 text-muted-foreground shrink-0" />
            <span
              className={cn('transition-opacity duration-300 whitespace-nowrap', isCollapsed && 'opacity-0 w-0 hidden')}
            >
              Profile
            </span>
          </Link>
        </div>
      </nav>

      {/* Footer / User Profile */}
      <div className={cn('p-4 border-t border-border', isCollapsed && 'p-2')}>
        <div className={cn('flex items-center gap-3 mb-4', isCollapsed && 'justify-center mb-2')}>
          <div className="w-10 h-10 rounded-full bg-muted shrink-0 flex items-center justify-center text-muted-foreground font-bold">
            {currentAdmin?.name?.substring(0, 2).toUpperCase() || 'AD'}
          </div>
          <div className={cn('overflow-hidden transition-all duration-300', isCollapsed && 'w-0 opacity-0 hidden')}>
            <p className="text-sm font-semibold text-foreground truncate">{currentAdmin?.name || 'Admin User'}</p>
            <p className="text-xs text-muted-foreground truncate">{currentAdmin?.email || 'admin@example.com'}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          title={isCollapsed ? 'Log Out' : undefined}
          className={cn(
            'w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-foreground bg-secondary rounded-lg hover:bg-accent transition-colors cursor-pointer',
            isCollapsed && 'px-2'
          )}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          <span
            className={cn('transition-opacity duration-300 whitespace-nowrap', isCollapsed && 'opacity-0 w-0 hidden')}
          >
            Log Out
          </span>
        </button>
      </div>
    </aside>
  );
}
