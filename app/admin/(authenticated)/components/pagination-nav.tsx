'use client';

import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from '@/app/guard/components/ui/pagination';

type PaginationNavProps = {
  page: number;
  perPage: number;
  totalCount: number;
};

export default function PaginationNav({ page, perPage, totalCount }: PaginationNavProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const pageCount = Math.ceil(totalCount / perPage);

  const createPageURL = (pageNumber: number | string) => {
    const params = new URLSearchParams(searchParams);
    params.set('page', pageNumber.toString());
    return `?${params.toString()}`;
  };

  const handlePerPageChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newPerPage = event.target.value;
    const params = new URLSearchParams(searchParams);
    params.set('per_page', newPerPage);
    params.set('page', '1'); // Reset to first page
    router.push(`${pathname}?${params.toString()}`);
  };

  const pages = Array.from({ length: pageCount }, (_, i) => i + 1);

  if (totalCount === 0) {
    return null;
  }

  return (
    <div className="flex flex-col md:flex-row items-center justify-between gap-4 mt-8">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <span>Rows per page</span>
        <select
          value={perPage}
          onChange={handlePerPageChange}
          className="h-8 w-16 rounded-md border border-gray-200 bg-white text-sm focus:border-red-500 focus:ring-red-500/20"
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
              <PaginationPrevious href={page > 1 ? createPageURL(page - 1) : '#'} isActive={page > 1} />
            </PaginationItem>
            {pages.map(p => {
              if (p === 1 || p === pageCount || (p >= page - 1 && p <= page + 1)) {
                return (
                  <PaginationItem key={p}>
                    <PaginationLink href={createPageURL(p)} isActive={p === page}>
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
              <PaginationNext href={page < pageCount ? createPageURL(page + 1) : '#'} isActive={page < pageCount} />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}
