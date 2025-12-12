'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  MapPin,
  Users,
  Calendar,
  Bell,
  User,
  LogOut,
  Shield,
  Layers,
  UserCog,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
} from 'lucide-react';
import { Admin } from '@prisma/client';
import { cn } from '@/lib/utils';

const navItems = [
  { name: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
  { name: 'Sites', href: '/admin/sites', icon: MapPin },
  { name: 'Guards', href: '/admin/guards', icon: Users },
  { name: 'Shifts', href: '/admin/shifts', icon: Calendar },
  { name: 'Checkins', href: '/admin/checkins', icon: ClipboardCheck },
  { name: 'Shift Types', href: '/admin/shift-types', icon: Layers },
  { name: 'Alerts', href: '/admin/alerts', icon: Bell },
];

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
        'bg-white border-r border-gray-200 flex flex-col h-screen sticky top-0 transition-all duration-300 ease-in-out z-50 overflow-visible',
        isCollapsed ? 'w-20' : 'w-64'
      )}
    >
      {/* Logo */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-gray-100 relative group">
        <div className={cn('flex items-center gap-2 text-red-600 font-bold text-xl overflow-hidden', isCollapsed && 'justify-center w-full')}>
          <Shield className="w-8 h-8 flex-shrink-0 fill-red-600 text-white" />
          <span className={cn('transition-opacity duration-300 whitespace-nowrap', isCollapsed && 'opacity-0 w-0 hidden')}>
            Guard<span className="text-gray-900">Sys</span>
          </span>
        </div>
        
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className={cn(
            "p-2 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-900 transition-colors absolute -right-4 top-1/2 -translate-y-1/2 border border-gray-200 shadow-sm z-50",
          )}
        >
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto overflow-x-hidden">
        {navItems.map(item => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.name}
              href={item.href}
              title={isCollapsed ? item.name : undefined}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-red-50 text-red-600'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                isCollapsed && 'justify-center px-2'
              )}
            >
              <item.icon className={cn('w-5 h-5 flex-shrink-0', isActive ? 'text-red-600' : 'text-gray-500')} />
              <span className={cn('transition-opacity duration-300 whitespace-nowrap', isCollapsed && 'opacity-0 w-0 hidden')}>
                {item.name}
              </span>
            </Link>
          );
        })}

        {currentAdmin?.role === 'superadmin' && (
          <Link
            href="/admin/admins"
            title={isCollapsed ? "Admins" : undefined}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
              pathname.startsWith('/admin/admins')
                ? 'bg-red-50 text-red-600'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
               isCollapsed && 'justify-center px-2'
            )}
          >
            <UserCog className={cn('w-5 h-5 flex-shrink-0', pathname.startsWith('/admin/admins') ? 'text-red-600' : 'text-gray-500')} />
            <span className={cn('transition-opacity duration-300 whitespace-nowrap', isCollapsed && 'opacity-0 w-0 hidden')}>
              Admins
            </span>
          </Link>
        )}

        <div className="pt-4 mt-4 border-t border-gray-100">
          <Link
            href="/admin/profile"
            title={isCollapsed ? "Profile" : undefined}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
              pathname.startsWith('/admin/profile')
                ? 'bg-red-50 text-red-600'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
              isCollapsed && 'justify-center px-2'
            )}
          >
            <User className="w-5 h-5 text-gray-500 flex-shrink-0" />
            <span className={cn('transition-opacity duration-300 whitespace-nowrap', isCollapsed && 'opacity-0 w-0 hidden')}>
              Profile
            </span>
          </Link>
        </div>
      </nav>

      {/* Footer / User Profile */}
      <div className={cn('p-4 border-t border-gray-200', isCollapsed && 'p-2')}>
        <div className={cn('flex items-center gap-3 mb-4', isCollapsed && 'justify-center mb-2')}>
          <div className="w-10 h-10 rounded-full bg-gray-200 flex-shrink-0 flex items-center justify-center text-gray-500 font-bold">
            {currentAdmin?.name?.substring(0, 2).toUpperCase() || 'AD'}
          </div>
          <div className={cn('overflow-hidden transition-all duration-300', isCollapsed && 'w-0 opacity-0 hidden')}>
            <p className="text-sm font-semibold text-gray-900 truncate">{currentAdmin?.name || 'Admin User'}</p>
            <p className="text-xs text-gray-500 truncate">{currentAdmin?.email || 'admin@example.com'}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          title={isCollapsed ? "Log Out" : undefined}
          className={cn(
            'w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer',
            isCollapsed && 'px-2'
          )}
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          <span className={cn('transition-opacity duration-300 whitespace-nowrap', isCollapsed && 'opacity-0 w-0 hidden')}>
            Log Out
          </span>
        </button>
      </div>
    </aside>
  );
}
