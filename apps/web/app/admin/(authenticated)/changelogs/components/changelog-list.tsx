'use client';

import { useState, ComponentType } from 'react';
import { Prisma } from '@prisma/client';
import { SerializedChangelogWithAdminDto, EntitySummary } from '@/types/changelogs';
import PaginationNav from '../../components/pagination-nav';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import SortableHeader from '@/components/sortable-header';
import { Eye, Filter } from 'lucide-react';
import ChangelogDetailsModal from './changelog-details-modal';
import { format } from 'date-fns';
import ChangelogExport from './changelog-export';


type FilterModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onApply: (filters: {
    startDate?: Date;
    endDate?: Date;
    action?: string;
    entityType?: string;
    entityId?: string;
  }) => void;
  initialFilters: {
    startDate?: string | null;
    endDate?: string | null;
    action?: string | null;
    entityType?: string | null;
    entityId?: string | null;
  };
  employees?: EntitySummary[];
  sites?: EntitySummary[];
  shiftTypes?: EntitySummary[];
  offices?: EntitySummary[];
};

type ChangelogListProps = {
  changelogs: SerializedChangelogWithAdminDto[];
  page: number;
  perPage: number;
  totalCount: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  hideEntityType?: boolean;
  fixedEntityType?: string;
  showEntityName?: boolean;
  FilterModal: ComponentType<FilterModalProps>;
  employees?: EntitySummary[];
  sites?: EntitySummary[];
  shiftTypes?: EntitySummary[];
  offices?: EntitySummary[];
};

export default function ChangelogList({
  changelogs,
  page,
  perPage,
  totalCount,
  sortBy = 'createdAt',
  sortOrder = 'desc',
  hideEntityType = false,
  fixedEntityType,
  showEntityName = false,
  FilterModal,
  employees,
  sites,
  shiftTypes,
  offices,
}: ChangelogListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [selectedDetails, setSelectedDetails] = useState<Prisma.JsonValue | null>(null);
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const handleSort = (field: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (sortBy === field) {
      params.set('sortOrder', sortOrder === 'desc' ? 'asc' : 'desc');
    } else {
      params.set('sortBy', field);
      params.set('sortOrder', 'desc');
    }
    params.set('page', '1');
    router.push(`${pathname}?${params.toString()}`);
  };

  const handleApplyFilter = (filters: Record<string, string | Date | null | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());

    if (filters.startDate instanceof Date) {
      params.set('startDate', format(filters.startDate, 'yyyy-MM-dd'));
    } else if (typeof filters.startDate === 'string') {
      params.set('startDate', filters.startDate);
    } else {
      params.delete('startDate');
    }

    if (filters.endDate instanceof Date) {
      params.set('endDate', format(filters.endDate, 'yyyy-MM-dd'));
    } else if (typeof filters.endDate === 'string') {
      params.set('endDate', filters.endDate);
    } else {
      params.delete('endDate');
    }

    if (typeof filters.action === 'string' && filters.action) {
      params.set('action', filters.action);
    } else {
      params.delete('action');
    }

    if (typeof filters.entityType === 'string' && filters.entityType) {
      params.set('entityType', filters.entityType);
    } else {
      params.delete('entityType');
    }

    if (typeof filters.entityId === 'string' && filters.entityId) {
      params.set('entityId', filters.entityId);
    } else {
      params.delete('entityId');
    }

    params.set('page', '1');
    router.push(`${pathname}?${params.toString()}`);
  };

  const activeFiltersCount = [
    searchParams.get('startDate'),
    searchParams.get('endDate'),
    searchParams.get('action'),
    searchParams.get('entityType'),
    searchParams.get('entityId'),
  ].filter(Boolean).length;

  return (
    <div>
      {/* Header & Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {fixedEntityType ? `${fixedEntityType} Audit Log` : 'Audit Log'}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {fixedEntityType
              ? `Track changes for ${fixedEntityType}s.`
              : 'Track system changes and administrative actions.'}
          </p>
        </div>
        <div className="flex flex-col md:flex-row items-center gap-2 w-full md:w-auto">
          <ChangelogExport entityType={fixedEntityType} />
          <button
            onClick={() => setIsFilterOpen(true)}
            className={`inline-flex items-center justify-center h-10 px-4 py-2 bg-card border border-border text-foreground text-sm font-semibold rounded-lg hover:bg-muted transition-colors shadow-sm w-full md:w-auto ${
              activeFiltersCount > 0
                ? 'text-red-600 dark:text-red-400 border-red-200 dark:border-red-900/30 bg-red-50 dark:bg-red-950/30'
                : ''
            }`}
          >
            <Filter className="w-4 h-4 mr-2" />
            Filters
            {activeFiltersCount > 0 && (
              <span className="ml-2 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 px-2 py-0.5 rounded-full text-xs">
                {activeFiltersCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <SortableHeader
                  label="Date"
                  field="createdAt"
                  currentSortBy={sortBy}
                  currentSortOrder={sortOrder}
                  onSort={handleSort}
                  className="pl-6"
                />
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Actor Type</th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Actor</th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Action</th>
                {!hideEntityType && (
                  <SortableHeader
                    label="Entity Type"
                    field="entityType"
                    currentSortBy={sortBy}
                    currentSortOrder={sortOrder}
                    onSort={handleSort}
                  />
                )}
                {showEntityName && (
                  <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Name</th>
                )}
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider text-right">
                  Details
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {changelogs.length === 0 ? (
                <tr>
                  <td
                    colSpan={hideEntityType ? (showEntityName ? 6 : 5) : showEntityName ? 7 : 6}
                    className="py-8 text-center text-muted-foreground"
                  >
                    No logs found.
                  </td>
                </tr>
              ) : (
                changelogs.map(log => (
                  <tr key={log.id} className="hover:bg-muted/50 transition-colors">
                    <td className="py-4 px-6 text-sm text-muted-foreground whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="py-4 px-6 text-sm text-muted-foreground capitalize">{log.actor}</td>
                    <td className="py-4 px-6 text-sm font-medium text-foreground">
                      {log.actor === 'system' ? (
                        <span className="text-muted-foreground/70 italic bg-muted/50 px-2 py-0.5 rounded text-xs">
                          System
                        </span>
                      ) : log.actor === 'admin' ? (
                        log.admin?.name || 'Administrator'
                      ) : (
                        <span className="text-muted-foreground/50 italic">Unknown</span>
                      )}
                    </td>
                    <td className="py-4 px-6 text-sm">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium 
                        ${
                          log.action === 'CREATE' || log.action === 'BULK_CREATE'
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400'
                            : log.action === 'DELETE'
                              ? 'bg-red-100 dark:bg-red-950/30 text-red-800 dark:text-red-400'
                              : 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400'
                        }`}
                      >
                        {log.action}
                      </span>
                    </td>
                    {!hideEntityType && <td className="py-4 px-6 text-sm text-muted-foreground">{log.entityType}</td>}
                    {showEntityName && (
                      <td className="py-4 px-6 text-sm text-muted-foreground">
                        {/* Safe access to details.name if it exists */}
                        {log.details && typeof log.details === 'object' && 'name' in log.details
                          ? String((log.details as Record<string, unknown>).name)
                          : '-'}
                      </td>
                    )}
                    <td className="py-4 px-6 text-right">
                      <button
                        onClick={() => setSelectedDetails(log.details)}
                        className="p-2 text-muted-foreground hover:text-primary hover:bg-muted rounded-lg transition-colors cursor-pointer"
                        title="View Details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <PaginationNav page={page} perPage={perPage} totalCount={totalCount} />

      <ChangelogDetailsModal
        isOpen={!!selectedDetails}
        onClose={() => setSelectedDetails(null)}
        details={
          selectedDetails as Record<string, string> | { changes: Record<string, { from: string; to: string }> } | null
        }
      />

      <FilterModal
        key={isFilterOpen ? 'open' : 'closed'}
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        onApply={handleApplyFilter}
        initialFilters={{
          startDate: searchParams.get('startDate'),
          endDate: searchParams.get('endDate'),
          action: searchParams.get('action'),
          entityType: searchParams.get('entityType'),
          entityId: searchParams.get('entityId'),
        }}
        employees={employees}
        sites={sites}
        shiftTypes={shiftTypes}
        offices={offices}
      />
    </div>
  );
}
