'use client';

import React, { createContext, useContext, useMemo } from 'react';
import { PermissionCode, isValidPermissionCode } from '@/lib/auth/permissions';

interface SessionContextType {
  userId: string | null;
  roleName: string | null;
  permissions: string[];
  employeeVisibilityScope: 'all' | 'on_site_only';
  hasPermission: (permission: PermissionCode) => boolean;
  isSuperAdmin: boolean;
  canAccessOfficeAttendance: boolean;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export function SessionProvider({
  children,
  session,
}: {
  children: React.ReactNode;
  session: {
    userId: string | null;
    roleName: string | null;
    permissions: string[];
    employeeVisibilityScope: 'all' | 'on_site_only';
  };
}) {
  const isSuperAdmin = session.roleName === 'Super Admin' || session.roleName === 'superadmin';
  const canAccessOfficeAttendance = isSuperAdmin || session.employeeVisibilityScope === 'all';

  const hasPermission = useMemo(() => {
    return (permission: PermissionCode) => {
      if (isSuperAdmin) return true;
      return session.permissions.includes(permission);
    };
  }, [isSuperAdmin, session.permissions]);

  const value = useMemo(
    () => ({
      ...session,
      hasPermission,
      isSuperAdmin,
      canAccessOfficeAttendance,
    }),
    [session, hasPermission, isSuperAdmin, canAccessOfficeAttendance]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
}

export function usePermission(permission: string) {
  const { hasPermission } = useSession();
  if (!isValidPermissionCode(permission)) {
    return false;
  }
  return hasPermission(permission);
}
