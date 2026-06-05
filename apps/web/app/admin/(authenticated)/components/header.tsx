'use client';

import { type ComponentType } from 'react';
import { ModeToggle } from '@/components/mode-toggle';
import AlertNotifications from './alert-notifications';
import AdminNotificationInbox from './admin-notification-inbox';
import { AdminSession } from '@/lib/admin-auth';
import AdminProfileDropdown from './admin-profile-dropdown';
import { Radio, Ticket, Users, Building2, FileSearch, Activity } from 'lucide-react';
import { cn } from '@repo/shared';
import Link from 'next/link';
import { type AdminTabSlug, getAdminDashboardHref } from '@/lib/admin-tab-routing';
import { useAdminDashboardTab } from '../context/admin-dashboard-tab-context';

const HEADER_MENUS = [
  {
    id: 'dashboard',
    tab: 'dashboard',
    title: 'LIVE OPERATIONS',
    subtitle: 'System Overview',
    icon: Activity,
    color: 'text-indigo-500',
    activeBg: 'bg-indigo-500/10',
    activeBorder: 'border-indigo-500/50',
  },
  {
    id: 'live-operations',
    tab: 'guard',
    title: 'GUARD OPERATIONS',
    subtitle: 'Control Room',
    icon: Radio,
    color: 'text-red-500',
    activeBg: 'bg-red-500/10',
    activeBorder: 'border-red-500/50',
  },
  {
    id: 'tickets',
    tab: 'ticket',
    title: 'TICKET COMMAND CENTER',
    subtitle: 'Manage & Resolve',
    icon: Ticket,
    color: 'text-purple-500',
    activeBg: 'bg-purple-500/10',
    activeBorder: 'border-purple-500/50',
  },
  {
    id: 'workforce',
    tab: 'workforce',
    title: 'WORKFORCE & HR',
    subtitle: 'People & Schedules',
    icon: Users,
    color: 'text-green-500',
    activeBg: 'bg-green-500/10',
    activeBorder: 'border-green-500/50',
  },
  {
    id: 'clients',
    tab: 'client',
    title: 'CLIENT & SITE MANAGEMENT',
    subtitle: 'Clients, Sites & Contracts',
    icon: Building2,
    color: 'text-blue-500',
    activeBg: 'bg-blue-500/10',
    activeBorder: 'border-blue-500/50',
  },
  {
    id: 'system',
    tab: 'system',
    title: 'SYSTEM & AUDIT',
    subtitle: 'System Health & Logs',
    icon: FileSearch,
    color: 'text-orange-500',
    activeBg: 'bg-orange-500/10',
    activeBorder: 'border-orange-500/50',
  },
] as const satisfies ReadonlyArray<{
  id: string;
  tab: AdminTabSlug;
  title: string;
  subtitle: string;
  icon: ComponentType<{ className?: string }>;
  color: string;
  activeBg: string;
  activeBorder: string;
}>;

export default function Header({ currentAdmin }: { currentAdmin: AdminSession }) {
  const { selectedTab } = useAdminDashboardTab();

  return (
    <header className="h-16 bg-card border-b border-border px-6 flex items-center justify-between sticky top-0 z-10">
      {/* Left Placeholder for centering */}
      <div className="flex-1 hidden lg:block" />

      <div className="flex items-center gap-1.5 h-full py-2">
        {HEADER_MENUS.map((menu) => {
          const isActive = selectedTab === menu.tab;
          const Icon = menu.icon;

          return (
            <Link
              key={menu.id}
              href={getAdminDashboardHref(menu.tab)}
              className={cn(
                "flex items-center gap-3 px-4 py-1.5 rounded-lg border border-transparent transition-all duration-200 group relative whitespace-nowrap",
                isActive ? cn(menu.activeBg, menu.activeBorder, "ring-1 ring-primary/10 shadow-sm") : "hover:bg-accent/50"
              )}
            >
              <div className={cn(
                "p-2 rounded-lg transition-colors shrink-0",
                isActive ? menu.activeBg : "bg-accent group-hover:bg-accent/80"
              )}>
                <Icon className={cn("w-5 h-5", menu.color)} />
              </div>
              <div className="flex flex-col text-left">
                <span className={cn(
                  "text-[12px] font-bold tracking-wider transition-colors",
                  isActive ? "text-foreground" : "text-foreground/90 group-hover:text-foreground"
                )}>
                  {menu.title}
                </span>
                <span className={cn(
                  "text-[11px] font-medium transition-colors",
                  isActive ? "text-muted-foreground" : "text-muted-foreground/80 group-hover:text-muted-foreground"
                )}>
                  {menu.subtitle}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
      
      <div className="flex-1 flex items-center justify-end gap-4 shrink-0">
        <AdminNotificationInbox />
        <AlertNotifications />
        <ModeToggle />
        <div className="w-px h-8 bg-border mx-1" />
        <AdminProfileDropdown currentAdmin={currentAdmin} />
      </div>
    </header>
  );
}
