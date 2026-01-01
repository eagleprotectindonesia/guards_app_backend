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
  History,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  role?: 'admin' | 'superadmin';
}

export const ADMIN_NAV_ITEMS: NavItem[] = [
  { name: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
  { name: 'Sites', href: '/admin/sites', icon: MapPin },
  { name: 'Guards', href: '/admin/guards', icon: Users },
  { name: 'Shift Types', href: '/admin/shift-types', icon: Layers },
  { name: 'Shifts', href: '/admin/shifts', icon: Calendar },
  { name: 'Attendance', href: '/admin/attendance', icon: ClipboardCheck },
  { name: 'Checkins', href: '/admin/checkins', icon: ClipboardCheck },
  { name: 'Alerts', href: '/admin/alerts', icon: Bell },
];

export const ADMIN_SECONDARY_NAV_ITEMS: NavItem[] = [
  { name: 'Admins', href: '/admin/admins', icon: UserCog, role: 'superadmin' },
  { name: 'Changelogs', href: '/admin/changelogs', icon: History, role: 'superadmin' },
  { name: 'Profile', href: '/admin/profile', icon: User },
];

export const ADMIN_LABEL_MAP: Record<string, string> = {
  dashboard: 'Dashboard',
  guards: 'Guards',
  sites: 'Sites',
  'shift-types': 'Shift Types',
  shifts: 'Shifts',
  attendance: 'Attendance',
  checkins: 'Checkins',
  alerts: 'Alerts',
  profile: 'Profile',
  changelogs: 'Changelogs',
  admins: 'Admins',
};
