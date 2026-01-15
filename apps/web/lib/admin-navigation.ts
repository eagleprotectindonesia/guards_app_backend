import {
  LayoutDashboard,
  MapPin,
  Users,
  Calendar,
  Bell,
  Layers,
  ClipboardCheck,
  User,
  UserCog,
  Settings,
  Building2,
  Briefcase,
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
  { name: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard, requiredPermission: 'dashboard:view' },
  { name: 'Sites', href: '/admin/sites', icon: MapPin, requiredPermission: 'sites:view' },
  { name: 'Employees', href: '/admin/employees', icon: Users, requiredPermission: 'employees:view' },
  { name: 'Departments', href: '/admin/departments', icon: Building2, requiredPermission: 'departments:view' },
  { name: 'Designations', href: '/admin/designations', icon: Briefcase, requiredPermission: 'designations:view' },
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
  { name: 'Profile', href: '/admin/profile', icon: User },
];

export const ADMIN_LABEL_MAP: Record<string, string> = {
  dashboard: 'Dashboard',
  employees: 'Employees',
  guards: 'Employees', // Backward compatibility
  departments: 'Departments',
  designations: 'Designations',
  sites: 'Sites',
  'shift-types': 'Shift Types',
  shifts: 'Shifts',
  attendance: 'Attendance',
  checkins: 'Checkins',
  alerts: 'Alerts',
  profile: 'Profile',
  // changelogs: 'Changelogs',
  admins: 'Admins',
  settings: 'Settings',
};
