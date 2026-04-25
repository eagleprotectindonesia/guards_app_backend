import {
  LayoutDashboard,
  MapPin,
  Users,
  Calendar,
  Bell,
  Layers,
  ClipboardCheck,
  UserCog,
  Settings,
  Hotel,
  Clock3,
  MessageSquare,
  CalendarCheck2,
  type LucideIcon,
} from 'lucide-react';
import { PermissionCode } from './auth/permissions';

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

export function getAdminNavItems(officeWorkSchedulesEnabled = true): NavItem[] {
  return [
    { name: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
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
    { name: 'Guard Shift Types', href: '/admin/guard-shift-types', icon: Layers, requiredPermission: 'shift-types:view' },
    { name: 'Guard Shifts', href: '/admin/guard-shifts', icon: Calendar, requiredPermission: 'shifts:view' },
    { name: 'Attendance', href: '/admin/attendance', icon: ClipboardCheck, requiredPermission: 'attendance:view' },
    { name: 'Guard Checkins', href: '/admin/guard-checkins', icon: ClipboardCheck, requiredPermission: 'checkins:view' },
    { name: 'Alerts', href: '/admin/alerts', icon: Bell, requiredPermission: 'alerts:view' },
  ];
}

export function getAdminNavGroups(officeWorkSchedulesEnabled = true): NavGroup[] {
  const allItems = getAdminNavItems(officeWorkSchedulesEnabled);
  const byName = new Map(allItems.map(item => [item.name, item]));

  return [
    {
      label: 'Dashboard',
      items: [byName.get('Dashboard')].filter(Boolean) as NavItem[],
    },
    {
      label: 'Office',
      items: [
        byName.get('Offices'),
        byName.get('Office Schedules'),
        byName.get('Office Shift Types'),
        byName.get('Office Shifts'),
        byName.get('Office Memos'),
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
      items: [byName.get('Employees'), byName.get('Attendance'), byName.get('Holiday Calendar'), byName.get('Leave Requests')].filter(
        Boolean
      ) as NavItem[],
    },
    {
      label: 'System',
      items: [byName.get('Admins'), byName.get('Roles'), byName.get('Settings')].filter(Boolean) as NavItem[],
    },
  ].filter(group => group.items.length > 0);
}

export const ADMIN_SECONDARY_NAV_ITEMS: NavItem[] = [
  { name: 'Admins', href: '/admin/admins', icon: UserCog, requiredPermission: 'admins:view' },
  { name: 'Roles', href: '/admin/system/roles', icon: UserCog, requiredPermission: 'roles:view' },
  { name: 'Settings', href: '/admin/settings', icon: Settings, requiredPermission: 'system-settings:view' },
];

export const ADMIN_LABEL_MAP: Record<string, string> = {
  dashboard: 'Dashboard',
  employees: 'Employees',
  sites: 'Sites',
  offices: 'Offices',
  'office-work-schedules': 'Office Schedules',
  'office-shift-types': 'Office Shift Types',
  'office-shifts': 'Office Shifts',
  'leave-requests': 'Leave Requests',
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
