'use client';

import Link from 'next/link';
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
import { useAdminNavigationPending } from '../context/admin-navigation-pending-context';

export function AdminBreadcrumb() {
  const pathname = usePathname();
  const { pendingHref, startNavigation } = useAdminNavigationPending();
  const allPaths = pathname.split('/').filter(Boolean);

  const handlePendingNavigation = (href: string) => (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (pathname === href) return;

    startNavigation(href);
  };

  // Create objects with path and original index to ensure correct href generation
  const paths = allPaths
    .map((path, index) => ({ path, index }))
    .filter(({ path, index }) => !(path === 'admin' && index === 0));

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link
              href="/admin/dashboard"
              onClick={handlePendingNavigation('/admin/dashboard')}
              className={pendingHref === '/admin/dashboard' ? 'flex items-center gap-1 opacity-70 cursor-progress' : 'flex items-center gap-1'}
            >
              <Home className="h-4 w-4" />
              <span className="sr-only">Home</span>
            </Link>
          </BreadcrumbLink>
        </BreadcrumbItem>

        {paths.map(({ path, index }, filteredIndex) => {
          const href = `/${allPaths.slice(0, index + 1).join('/')}`;
          const isLast = filteredIndex === paths.length - 1;
          const label = ADMIN_LABEL_MAP[path] || path.charAt(0).toUpperCase() + path.slice(1).replace(/-/g, ' ');

          return (
            <React.Fragment key={href}>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage>{label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link
                      href={href}
                      onClick={handlePendingNavigation(href)}
                      className={pendingHref === href ? 'opacity-70 cursor-progress' : undefined}
                    >
                      {label}
                    </Link>
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
