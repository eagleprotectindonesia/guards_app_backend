'use client';

import { useMemo, type ChangeEvent } from 'react';
import { useSearchParams, usePathname } from 'next/navigation';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from '@/components/ui/pagination';
import { useAdminRouter } from '../context/admin-router';

type PaginationNavProps = {
  page: number;
  perPage: number;
  totalCount: number;
};

export default function PaginationNav({ page, perPage, totalCount }: PaginationNavProps) {
  const router = useAdminRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { pendingHref } = router;

  const pageCount = Math.ceil(totalCount / perPage);

  const createPageURL = (pageNumber: number | string) => {
    const params = new URLSearchParams(searchParams);
    params.set('page', pageNumber.toString());
    return `${pathname}?${params.toString()}`;
  };

  const isPendingHref = (href: string) => pendingHref === href;

  const handlePerPageChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const newPerPage = event.target.value;
    const params = new URLSearchParams(searchParams);
    params.set('per_page', newPerPage);
    params.set('page', '1'); // Reset to first page
    router.push(`${pathname}?${params.toString()}`);
  };

  const pages = useMemo(() => Array.from({ length: pageCount }, (_, i) => i + 1), [pageCount]);

  if (totalCount === 0) {
    return null;
  }

  return (
    <div className="flex flex-col md:flex-row items-center justify-between gap-4 mt-8">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>Rows per page</span>
        <select
          value={perPage}
          onChange={handlePerPageChange}
          className="h-8 w-16 rounded-md border border-border bg-card text-sm focus:border-red-500 focus:ring-red-500/20"
        >
          {[5, 10, 20, 50].map(size => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </div>

      {pageCount > 0 && (
        <Pagination className="mx-0 w-auto">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href={page > 1 ? createPageURL(page - 1) : '#'}
                isActive={page > 1}
                onClick={event => {
                  event.preventDefault();
                  if (page > 1) router.push(createPageURL(page - 1));
                }}
                className={page > 1 && isPendingHref(createPageURL(page - 1)) ? 'opacity-70 cursor-progress' : undefined}
              />
            </PaginationItem>
            {pages.map(p => {
              if (p === 1 || p === pageCount || (p >= page - 1 && p <= page + 1)) {
                return (
                  <PaginationItem key={p}>
                    <PaginationLink
                      href={createPageURL(p)}
                      isActive={p === page}
                      onClick={event => {
                        event.preventDefault();
                        router.push(createPageURL(p));
                      }}
                      className={isPendingHref(createPageURL(p)) ? 'opacity-70 cursor-progress' : undefined}
                    >
                      {p}
                    </PaginationLink>
                  </PaginationItem>
                );
              } else if ((p === page - 2 && page - 2 > 1) || (p === page + 2 && page + 2 < pageCount)) {
                return (
                  <PaginationItem key={p}>
                    <PaginationEllipsis />
                  </PaginationItem>
                );
              }
              return null;
            })}
            <PaginationItem>
              <PaginationNext
                href={page < pageCount ? createPageURL(page + 1) : '#'}
                isActive={page < pageCount}
                onClick={event => {
                  event.preventDefault();
                  if (page < pageCount) router.push(createPageURL(page + 1));
                }}
                className={page < pageCount && isPendingHref(createPageURL(page + 1)) ? 'opacity-70 cursor-progress' : undefined}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}
