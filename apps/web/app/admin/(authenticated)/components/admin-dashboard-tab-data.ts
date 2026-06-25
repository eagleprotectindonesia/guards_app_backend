import { type ComponentType } from 'react';
import { Radio, Ticket, Users, Building2, LineChart, Activity } from 'lucide-react';
import { type AdminTabSlug } from '@/lib/admin-tab-routing';
import { PermissionCode } from '@/lib/auth/permissions';

export const TAB_PERMISSIONS: Record<AdminTabSlug, PermissionCode> = {
  dashboard: 'dashboard:view',
  guard: 'dashboard-guard:view',
  ticket: 'tickets:view',
  workforce: 'dashboard-hr:view',
  client: 'dashboard-client:view',
  executive: 'dashboard-executive:view',
};

export const DASHBOARD_TABS = [
  {
    id: 'dashboard',
    tab: 'dashboard' as AdminTabSlug,
    title: 'LIVE OPERATIONS',
    subtitle: 'System Overview',
    icon: Activity,
    color: 'text-indigo-500',
    activeBg: 'bg-indigo-500/10',
    activeBorder: 'border-indigo-500/50',
  },
  {
    id: 'live-operations',
    tab: 'guard' as AdminTabSlug,
    title: 'GUARD OPERATIONS',
    subtitle: 'Control Room',
    icon: Radio,
    color: 'text-red-500',
    activeBg: 'bg-red-500/10',
    activeBorder: 'border-red-500/50',
  },
  {
    id: 'tickets',
    tab: 'ticket' as AdminTabSlug,
    title: 'TICKET COMMAND CENTER',
    subtitle: 'Manage & Resolve',
    icon: Ticket,
    color: 'text-purple-500',
    activeBg: 'bg-purple-500/10',
    activeBorder: 'border-purple-500/50',
  },
  {
    id: 'workforce',
    tab: 'workforce' as AdminTabSlug,
    title: 'WORKFORCE & HR',
    subtitle: 'People & Schedules',
    icon: Users,
    color: 'text-green-500',
    activeBg: 'bg-green-500/10',
    activeBorder: 'border-green-500/50',
  },
  {
    id: 'clients',
    tab: 'client' as AdminTabSlug,
    title: 'CLIENT & SITE MANAGEMENT',
    subtitle: 'Clients, Sites & Contracts',
    icon: Building2,
    color: 'text-blue-500',
    activeBg: 'bg-blue-500/10',
    activeBorder: 'border-blue-500/50',
  },
  {
    id: 'executive',
    tab: 'executive' as AdminTabSlug,
    title: 'EXECUTIVE OVERVIEW',
    subtitle: 'Business Summary',
    icon: LineChart,
    color: 'text-amber-500',
    activeBg: 'bg-amber-500/10',
    activeBorder: 'border-amber-500/50',
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
