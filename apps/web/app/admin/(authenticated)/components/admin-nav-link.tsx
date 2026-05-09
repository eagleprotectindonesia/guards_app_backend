'use client';

import React from 'react';
import Link, { type LinkProps } from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useAdminNavigationPending } from '../context/admin-navigation-pending-context';

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

  const currentUrl = searchParams.toString() ? `${pathname}?${searchParams.toString()}` : pathname;

  return (
    <Link
      href={href}
      target={target}
      onClick={event => {
        onClick?.(event);

        if (event.defaultPrevented) return;
        if (target && target !== '_self') return;
        if (isModifiedEvent(event)) return;
        if (href === currentUrl || href === pathname) return;
        if (href.startsWith('#')) return;
        if (isExternalHref(href)) return;

        startNavigation(href);
      }}
      {...props}
    >
      {children}
    </Link>
  );
}
