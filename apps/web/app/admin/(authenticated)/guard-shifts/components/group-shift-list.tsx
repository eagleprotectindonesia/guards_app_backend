'use client';

import { useState } from 'react';
import PaginationNav from '../../components/pagination-nav';
import { useSearchParams } from 'next/navigation';
import { useAdminRouter } from '../../context/admin-router';
import SortableHeader from '@/components/sortable-header';
import { DateRangeFilter, SelectFilter, FilterBar, useFilterUrlSync } from '../../components/filters';
import { format, parseISO } from 'date-fns';
import Link from 'next/link';
import { MessageSquare, ExternalLink } from 'lucide-react';


type GroupShiftRow = {
  id: string;
  siteId: string;
  endSiteId: string | null;
  shiftTypeId: string;
  date: Date;
  kind: string;
  clientName: string | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
  site: { id: string; name: string };
  endSite: { id: string; name: string } | null;
  shiftType: { id: string; name: string; startTime: string; endTime: string };
  groupChat: { id: string } | null;
  shifts: { id: string; status: string; employeeId: string | null }[];
};

type GroupShiftListProps = {
  groupShifts: GroupShiftRow[];
  sites: { id: string; name: string }[];
  escortSites: { id: string; name: string }[];
  startDate?: string;
  endDate?: string;
  siteId?: string;
  endSiteId?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page: number;
  perPage: number;
  totalCount: number;
  hideEscortSites?: boolean;
};

export default function GroupShiftList({
  groupShifts,
  sites,
  escortSites,
  startDate,
  endDate,
  siteId,
  endSiteId,
  sortBy = 'date',
  sortOrder = 'desc',
  page,
  perPage,
  totalCount,
  hideEscortSites = false,
}: GroupShiftListProps) {
  const router = useAdminRouter();
  const searchParams = useSearchParams();

  const { apply } = useFilterUrlSync('/admin/guard-shifts/group-shifts');

  const [filterStartDate, setFilterStartDate] = useState<Date | undefined>(
    startDate ? parseISO(startDate) : undefined
  );
  const [filterEndDate, setFilterEndDate] = useState<Date | undefined>(
    endDate ? parseISO(endDate) : undefined
  );
  const [filterSiteId, setFilterSiteId] = useState(siteId || '');
  const [filterEndSiteId, setFilterEndSiteId] = useState(endSiteId || '');

  const handleSort = (field: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (sortBy === field) {
      params.set('sortOrder', sortOrder === 'desc' ? 'asc' : 'desc');
    } else {
      params.set('sortBy', field);
      params.set('sortOrder', 'desc');
    }
    params.set('page', '1');
    router.push(`/admin/guard-shifts/group-shifts?${params.toString()}`);
  };

  const handleApplyFilters = () => {
    apply({
      startDate: filterStartDate ? format(filterStartDate, 'yyyy-MM-dd') : undefined,
      endDate: filterEndDate ? format(filterEndDate, 'yyyy-MM-dd') : undefined,
      siteId: filterSiteId || undefined,
      endSiteId: filterEndSiteId || undefined,
      page: '1',
    });
  };

  const handleClearFilters = () => {
    setFilterStartDate(undefined);
    setFilterEndDate(undefined);
    setFilterSiteId('');
    setFilterEndSiteId('');
    apply({
      startDate: undefined,
      endDate: undefined,
      siteId: undefined,
      endSiteId: undefined,
      page: '1',
    });
  };

  const statusAggregate = (shifts: GroupShiftRow['shifts']) => {
    if (shifts.length === 0) return '—';
    const counts: Record<string, number> = {};
    for (const s of shifts) {
      counts[s.status] = (counts[s.status] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([status, count]) => `${count} ${status}`)
      .join(', ');
  };

  return (
    <div className="bg-card rounded-xl shadow-sm border border-border p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">Group Shifts</h1>
      </div>

      <FilterBar onApply={handleApplyFilters} onClear={handleClearFilters}>
        <DateRangeFilter
          from={filterStartDate}
          to={filterEndDate}
          onChange={(from, to) => { setFilterStartDate(from); setFilterEndDate(to); }}
        />
        <SelectFilter
          id="start-site-filter"
          instanceId="start-site-filter"
          label="Start Site"
          options={sites.map(s => ({ value: s.id, label: s.name }))}
          value={filterSiteId}
          onChange={v => setFilterSiteId(v || '')}
        />
        {!hideEscortSites && (
          <SelectFilter
            id="end-site-filter"
            instanceId="end-site-filter"
            label="End Site"
            options={escortSites.map(s => ({ value: s.id, label: s.name }))}
            value={filterEndSiteId}
            onChange={v => setFilterEndSiteId(v || '')}
          />
        )}
      </FilterBar>

      <div className="overflow-x-auto mt-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-3 px-2 font-medium text-foreground/60 w-12">#</th>
              <th className="text-left py-3 px-2 font-medium text-foreground/60">Client Name</th>
              <th className="text-left py-3 px-2 font-medium text-foreground/60">Site → End Site</th>
              <SortableHeader label="Date" field="date" currentSortBy={sortBy} currentSortOrder={sortOrder} onSort={handleSort} />
              <SortableHeader label="Shift Type" field="shiftType" currentSortBy={sortBy} currentSortOrder={sortOrder} onSort={handleSort} />
              <th className="text-left py-3 px-2 font-medium text-foreground/60">Guards</th>
              <th className="text-left py-3 px-2 font-medium text-foreground/60">Chat</th>
              <th className="text-left py-3 px-2 font-medium text-foreground/60 w-20">Actions</th>
            </tr>
          </thead>
          <tbody>
            {groupShifts.map((gs, i) => (
              <tr key={gs.id} className="border-b border-border hover:bg-accent/50 transition-colors">
                <td className="py-3 px-2 text-foreground/60">{totalCount - (page - 1) * perPage - i}</td>
                <td className="py-3 px-2 font-medium text-foreground">{gs.clientName || '—'}</td>
                <td className="py-3 px-2 text-foreground">{gs.site.name} → {gs.endSite?.name || '—'}</td>
                <td className="py-3 px-2 text-foreground">{format(new Date(gs.date), 'dd MMM yyyy')}</td>
                <td className="py-3 px-2 text-foreground">{gs.shiftType.name}</td>
                <td className="py-3 px-2 text-foreground">
                  <span className="font-medium">{gs.shifts.length}</span>
                  <span className="text-foreground/60 text-xs ml-1">— {statusAggregate(gs.shifts)}</span>
                </td>
                <td className="py-3 px-2">
                  {gs.groupChat ? (
                    <Link
                      href={`/admin/chat?group=${gs.groupChat.id}`}
                      className="inline-flex items-center gap-1 text-blue-500 hover:text-blue-400"
                    >
                      <MessageSquare size={14} />
                      Chat
                    </Link>
                  ) : (
                    <span className="text-foreground/40">—</span>
                  )}
                </td>
                <td className="py-3 px-2">
                  <Link
                    href={`/admin/guard-shifts/group-shifts/${gs.id}`}
                    className="inline-flex items-center gap-1 text-blue-500 hover:text-blue-400 text-xs"
                  >
                    <ExternalLink size={14} />
                    View
                  </Link>
                </td>
              </tr>
            ))}
            {groupShifts.length === 0 && (
              <tr>
                <td colSpan={8} className="py-12 text-center text-foreground/40">No group shifts found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <PaginationNav page={page} perPage={perPage} totalCount={totalCount} />
    </div>
  );
}
