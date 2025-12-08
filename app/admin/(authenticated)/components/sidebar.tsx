'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, MapPin, Users, Calendar, Bell, User, LogOut, Shield, Layers, UserCog } from 'lucide-react';
import { Admin } from '@prisma/client';

const navItems = [
  { name: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
  { name: 'Sites', href: '/admin/sites', icon: MapPin },
  { name: 'Guards', href: '/admin/guards', icon: Users },
  { name: 'Shifts', href: '/admin/shifts', icon: Calendar },
  { name: 'Shift Types', href: '/admin/shift-types', icon: Layers },
  { name: 'Alerts', href: '/admin/alerts', icon: Bell },
];

type SidebarProps = {
  currentAdmin: Admin | null;
};

export default function Sidebar({ currentAdmin }: SidebarProps) {
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
    <aside className="w-64 bg-white border-r border-gray-200 flex flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b border-gray-100">
        <div className="flex items-center gap-2 text-red-600 font-bold text-xl">
          <Shield className="w-8 h-8 fill-red-600 text-white" />
          <span>
            Guard<span className="text-gray-900">Sys</span>
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems.map(item => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive ? 'bg-red-50 text-red-600' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <item.icon className={`w-5 h-5 ${isActive ? 'text-red-600' : 'text-gray-500'}`} />
              {item.name}
            </Link>
          );
        })}

        {currentAdmin?.role === 'superadmin' && (
          <Link
            href="/admin/admins"
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              pathname.startsWith('/admin/admins')
                ? 'bg-red-50 text-red-600'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <UserCog className={`w-5 h-5 ${pathname.startsWith('/admin/admins') ? 'text-red-600' : 'text-gray-500'}`} />
            Admins
          </Link>
        )}

        <div className="pt-4 mt-4 border-t border-gray-100">
          <Link
            href="/admin/profile"
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              pathname.startsWith('/admin/profile')
                ? 'bg-red-50 text-red-600'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <User className="w-5 h-5 text-gray-500" />
            Profile
          </Link>
        </div>
      </nav>

      {/* Footer / User Profile */}
      <div className="p-4 border-t border-gray-200">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 font-bold">
            {currentAdmin?.name?.substring(0, 2).toUpperCase() || 'AD'}
          </div>
          <div className="overflow-hidden">
            <p className="text-sm font-semibold text-gray-900 truncate">{currentAdmin?.name || 'Admin User'}</p>
            <p className="text-xs text-gray-500 truncate">{currentAdmin?.email || 'admin@example.com'}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
          Log Out
        </button>
      </div>
    </aside>
  );
}
