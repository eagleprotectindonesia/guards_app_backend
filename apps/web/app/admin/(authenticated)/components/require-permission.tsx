'use client';

import React from 'react';
import { usePermission } from '@/app/admin/(authenticated)/context/session-context';

interface RequirePermissionProps {
  permission: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Conditionally renders children if the current user has the required permission.
 * Bypasses for Super Admin.
 */
export function RequirePermission({ permission, children, fallback = null }: RequirePermissionProps) {
  const hasPerm = usePermission(permission);

  if (!hasPerm) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
