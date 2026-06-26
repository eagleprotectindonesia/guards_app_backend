import {
  Activity,
  Radio,
  Ticket,
  Users,
  Building2,
  LayoutDashboard,
  MapPin,
  Calendar,
  Bell,
  Layers,
  ClipboardCheck,
  PlusSquare,
  List,
  UserRound,
  Inbox,
  Archive,
  UserCog,
  Settings,
  Hotel,
  Clock3,
  MessageSquare,
  CalendarCheck2,
  FileText,
  LineChart,
  type LucideIcon,
} from 'lucide-react';
import { PermissionCode } from './auth/permissions';
import { getAdminDashboardHref, type AdminTabSlug } from './admin-tab-routing';

export interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  requiredPermission?: PermissionCode;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const ADMIN_TICKET_NAV_ITEMS: NavItem[] = [
  { name: 'All Tickets', href: '/admin/ticket/all', icon: List, requiredPermission: 'tickets:view' },
  { name: 'Create Ticket', href: '/admin/ticket/create', icon: PlusSquare, requiredPermission: 'tickets:create' },
  { name: 'Acknowledged', href: '/admin/ticket/acknowledged', icon: UserRound, requiredPermission: 'tickets:view' },
  { name: 'Unassigned', href: '/admin/ticket/unassigned', icon: Inbox, requiredPermission: 'tickets:view' },
  { name: 'Closed Tickets', href: '/admin/ticket/closed', icon: Archive, requiredPermission: 'tickets:view' },
];

export function getAdminNavItems(officeWorkSchedulesEnabled = true): NavItem[] {
  return [
    { name: 'Dashboard', href: '/admin/new-dashboard', icon: LayoutDashboard },
    { name: 'Sites', href: '/admin/sites', icon: MapPin, requiredPermission: 'sites:view' },
    { name: 'Offices', href: '/admin/offices', icon: Hotel, requiredPermission: 'offices:view' },
    ...(officeWorkSchedulesEnabled
      ? [
          {
            name: 'Office Schedules',
            href: '/admin/office-work-schedules',
            icon: Clock3,
            requiredPermission: 'office-work-schedules:view' as const,
          },
        ]
      : []),
    {
      name: 'Office Shift Types',
      href: '/admin/office-shift-types',
      icon: Layers,
      requiredPermission: 'office-shift-types:view',
    },
    {
      name: 'Office Shifts',
      href: '/admin/office-shifts',
      icon: Calendar,
      requiredPermission: 'office-shifts:view',
    },
    {
      name: 'Leave Requests',
      href: '/admin/leave-requests',
      icon: CalendarCheck2,
      requiredPermission: 'leave-requests:view',
    },
    {
      name: 'Leave Balances',
      href: '/admin/leave-balances',
      icon: CalendarCheck2,
      requiredPermission: 'leave-requests:view',
    },
    {
      name: 'Holiday Calendar',
      href: '/admin/holiday-calendars',
      icon: CalendarCheck2,
      requiredPermission: 'holiday-calendars:view',
    },
    {
      name: 'Office Memos',
      href: '/admin/office-memos',
      icon: MessageSquare,
      requiredPermission: 'office-memos:view',
    },
    { name: 'Chat', href: '/admin/chat', icon: MessageSquare, requiredPermission: 'chat:view' },
    { name: 'Employees', href: '/admin/employees', icon: Users, requiredPermission: 'employees:view' },
    {
      name: 'Guard Shift Types',
      href: '/admin/guard-shift-types',
      icon: Layers,
      requiredPermission: 'shift-types:view',
    },
    { name: 'Guard Shifts', href: '/admin/guard-shifts', icon: Calendar, requiredPermission: 'shifts:view' },
    {
      name: 'Shift Photo Reports',
      href: '/admin/shift-photo-reports',
      icon: FileText,
      requiredPermission: 'shift-photo-reports:view',
    },
    { name: 'Attendance', href: '/admin/attendance', icon: ClipboardCheck, requiredPermission: 'attendance:view' },
    {
      name: 'Guard Checkins',
      href: '/admin/guard-checkins',
      icon: ClipboardCheck,
      requiredPermission: 'checkins:view',
    },
    { name: 'Alerts', href: '/admin/alerts', icon: Bell, requiredPermission: 'alerts:view' },
  ];
}

export function getAdminNavGroups(officeWorkSchedulesEnabled = true, _activeTab: AdminTabSlug = 'guard'): NavGroup[] {
  const allItems = getAdminNavItems(officeWorkSchedulesEnabled);
  const byName = new Map(allItems.map(item => [item.name, item]));

  return [
    {
      label: 'Dashboard',
      items: [
        { name: 'Executive Overview', href: '/admin/executive-overview', icon: LineChart, requiredPermission: 'dashboard-executive:view' as PermissionCode },
        { name: 'Dashboard', href: getAdminDashboardHref('dashboard'), icon: Activity, requiredPermission: 'dashboard:view' as PermissionCode },
        { name: 'Guard Ops', href: getAdminDashboardHref('guard'), icon: Radio, requiredPermission: 'dashboard-guard:view' as PermissionCode },
        { name: 'Tickets', href: getAdminDashboardHref('ticket'), icon: Ticket, requiredPermission: 'tickets:view' as PermissionCode },
        { name: 'Workforce', href: getAdminDashboardHref('workforce'), icon: Users, requiredPermission: 'dashboard-hr:view' as PermissionCode },
        { name: 'Client', href: getAdminDashboardHref('client'), icon: Building2, requiredPermission: 'dashboard-client:view' as PermissionCode },
      ],
    },
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
        byName.get('Leave Balances'),
      ].filter(Boolean) as NavItem[],
    },
    {
      label: 'Reporting',
      items: [
        byName.get('Shift Photo Reports'),
        byName.get('Office Memos'),
      ].filter(Boolean) as NavItem[],
    },
    {
      label: 'Ticket',
      items: ADMIN_TICKET_NAV_ITEMS,
    },
    {
      label: 'System',
      items: ADMIN_SECONDARY_NAV_ITEMS,
    },
  ].filter(group => group.items.length > 0);
}

export const ADMIN_SECONDARY_NAV_ITEMS: NavItem[] = [
  { name: 'Admins', href: '/admin/admins', icon: UserCog, requiredPermission: 'admins:view' },
  { name: 'Roles', href: '/admin/system/roles', icon: UserCog, requiredPermission: 'roles:view' },
  { name: 'Settings', href: '/admin/settings', icon: Settings, requiredPermission: 'system-settings:view' },
];

export const ADMIN_LABEL_MAP: Record<string, string> = {
  'executive-overview': 'Executive Overview',
  guard: 'Guard Operations',
  ticket: 'Ticket',
  workforce: 'Workforce',
  client: 'Client',
  system: 'System',
  dashboard: 'Dashboard',
  employees: 'Employees',
  sites: 'Sites',
  offices: 'Offices',
  'office-work-schedules': 'Office Schedules',
  'office-shift-types': 'Office Shift Types',
  'office-shifts': 'Office Shifts',
  'leave-requests': 'Leave Requests',
  'leave-balances': 'Leave Balances',
  'holiday-calendars': 'Holiday Calendar',
  'office-memos': 'Office Memos',
  'guard-shift-types': 'Guard Shift Types',
  'guard-shifts': 'Guard Shifts',
  attendance: 'Attendance',
  'guard-checkins': 'Guard Checkins',
  alerts: 'Alerts',
  chat: 'Chat',
  profile: 'Profile',
  // changelogs: 'Changelogs',
  admins: 'Admins',
  settings: 'Settings',
};
