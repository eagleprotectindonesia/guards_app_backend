'use client';

import { usePathname } from 'next/navigation';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import React from 'react';
import { Home } from 'lucide-react';
import { ADMIN_LABEL_MAP } from '@/lib/admin-navigation';
import { AdminNavLink } from './admin-nav-link';
import { getAdminDashboardHref } from '@/lib/admin-tab-routing';
import { useAdminDashboardTab } from '../context/admin-dashboard-tab-context';

export function AdminBreadcrumb() {
  const pathname = usePathname();
  const { selectedTab } = useAdminDashboardTab();

  if (pathname.includes('dashboard')) {
    return null;
  }

  const allPaths = pathname.split('/').filter(Boolean);

  // Create objects with path and original index to ensure correct href generation
  const paths = allPaths
    .map((path, index) => ({ path, index }))
    .filter(({ path, index }) => !(path === 'admin' && index === 0));

  const isEditPage = paths.length > 0 && paths[paths.length - 1].path === 'edit';

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <AdminNavLink href={getAdminDashboardHref(selectedTab)} className="flex items-center gap-1">
              <Home className="h-4 w-4" />
              <span className="sr-only">Home</span>
            </AdminNavLink>
          </BreadcrumbLink>
        </BreadcrumbItem>

        {paths.map(({ path, index }, filteredIndex) => {
          const href = `/${allPaths.slice(0, index + 1).join('/')}`;
          const isLast = filteredIndex === paths.length - 1;
          const isIdSegmentOnEditPage = isEditPage && filteredIndex === paths.length - 2;
          const label = ADMIN_LABEL_MAP[path] || path.charAt(0).toUpperCase() + path.slice(1).replace(/-/g, ' ');

          return (
            <React.Fragment key={href}>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                {isLast || isIdSegmentOnEditPage ? (
                  <BreadcrumbPage>{label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <AdminNavLink href={href} className="opacity-100">
                      {label}
                    </AdminNavLink>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </React.Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
