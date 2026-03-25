'use client';

import React, { createContext, useContext, useMemo } from 'react';
import { PermissionCode, isValidPermissionCode } from '@/lib/auth/permissions';
import { RolePolicy } from '@repo/validations';
import { canAccessOfficeAttendance } from '@/lib/auth/admin-visibility';

interface SessionContextType {
  userId: string | null;
  roleName: string | null;
  permissions: string[];
  rolePolicy: RolePolicy;
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
    rolePolicy: RolePolicy;
  };
}) {
  const isSuperAdmin = session.roleName === 'Super Admin' || session.roleName === 'superadmin';
  const canAccessOfficeAttendanceValue = canAccessOfficeAttendance({
    isSuperAdmin,
    rolePolicy: session.rolePolicy,
  });

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
      canAccessOfficeAttendance: canAccessOfficeAttendanceValue,
    }),
    [session, hasPermission, isSuperAdmin, canAccessOfficeAttendanceValue]
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
