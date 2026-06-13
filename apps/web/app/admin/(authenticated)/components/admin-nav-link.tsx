'use client';

import React from 'react';
import Link, { type LinkProps } from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useAdminNavigationPending } from '../context/admin-navigation-pending-context';
import { appendDashboardTabToHref } from '@/lib/admin-tab-routing';
import { useAdminDashboardTab } from '../context/admin-dashboard-tab-context';

type AdminNavLinkProps = LinkProps &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps> & {
    href: string;
  };

function isModifiedEvent(event: React.MouseEvent<HTMLAnchorElement>) {
  return event.metaKey || event.altKey || event.ctrlKey || event.shiftKey || event.button !== 0;
}

function isExternalHref(href: string) {
  return /^(https?:)?\/\//.test(href);
}

export function AdminNavLink({ href, onClick, target, children, ...props }: AdminNavLinkProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { startNavigation } = useAdminNavigationPending();
  const { selectedTab } = useAdminDashboardTab();

  const currentUrl = searchParams.toString() ? `${pathname}?${searchParams.toString()}` : pathname;
  const resolvedHref = appendDashboardTabToHref(href, selectedTab);

  return (
    <Link
      href={resolvedHref}
      target={target}
      onClick={event => {
        onClick?.(event);

        if (event.defaultPrevented) return;
        if (target && target !== '_self') return;
        if (isModifiedEvent(event)) return;
        if (resolvedHref === currentUrl || resolvedHref === pathname) return;
        if (resolvedHref.startsWith('#')) return;
        if (isExternalHref(href)) return;

        startNavigation(resolvedHref);
      }}
      {...props}
    >
      {children}
    </Link>
  );
}
