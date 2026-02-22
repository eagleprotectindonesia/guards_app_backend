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
  MessageSquare,
  type LucideIcon,
} from 'lucide-react';
import { PermissionCode } from './auth/permissions';

export interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  requiredPermission?: PermissionCode;
}

export const ADMIN_NAV_ITEMS: NavItem[] = [
  { name: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
  { name: 'Sites', href: '/admin/sites', icon: MapPin, requiredPermission: 'sites:view' },
  { name: 'Offices', href: '/admin/offices', icon: Hotel, requiredPermission: 'offices:view' },
  { name: 'Chat', href: '/admin/chat', icon: MessageSquare, requiredPermission: 'chat:view' },
  { name: 'Employees', href: '/admin/employees', icon: Users, requiredPermission: 'employees:view' },
  { name: 'Shift Types', href: '/admin/shift-types', icon: Layers, requiredPermission: 'shift-types:view' },
  { name: 'Shifts', href: '/admin/shifts', icon: Calendar, requiredPermission: 'shifts:view' },
  { name: 'Attendance', href: '/admin/attendance', icon: ClipboardCheck, requiredPermission: 'attendance:view' },
  { name: 'Checkins', href: '/admin/checkins', icon: ClipboardCheck, requiredPermission: 'checkins:view' },
  { name: 'Alerts', href: '/admin/alerts', icon: Bell, requiredPermission: 'alerts:view' },
];

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
  'shift-types': 'Shift Types',
  shifts: 'Shifts',
  attendance: 'Attendance',
  checkins: 'Checkins',
  alerts: 'Alerts',
  chat: 'Chat',
  profile: 'Profile',
  // changelogs: 'Changelogs',
  admins: 'Admins',
  settings: 'Settings',
};
