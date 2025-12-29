'use client';

import { useState, ComponentType } from 'react';
import { Changelog, Prisma } from '@prisma/client';
import { Serialized } from '@/lib/utils';
import PaginationNav from '../../components/pagination-nav';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import SortableHeader from '@/components/sortable-header';
import { Eye, Filter } from 'lucide-react';
import ChangelogDetailsModal from './changelog-details-modal';
import { format } from 'date-fns';

type ChangelogWithAdmin = Changelog & {
  admin?: { name: string } | null;
};

type FilterModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onApply: (filters: Record<string, string | Date | null | undefined>) => void;
  initialFilters: Record<string, string | null>;
};

type ChangelogListProps = {
  changelogs: Serialized<ChangelogWithAdmin>[];
  page: number;
  perPage: number;
  totalCount: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  hideEntityType?: boolean;
  fixedEntityType?: string;
  showEntityName?: boolean;
  FilterModal: ComponentType<FilterModalProps>;
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

    params.set('page', '1');
    router.push(`${pathname}?${params.toString()}`);
  };

  const activeFiltersCount = [
    searchParams.get('startDate'),
    searchParams.get('endDate'),
    searchParams.get('action'),
    searchParams.get('entityType'),
  ].filter(Boolean).length;

  return (
    <div>
      {/* Header & Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {fixedEntityType ? `${fixedEntityType} Audit Log` : 'Audit Log'}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {fixedEntityType
              ? `Track changes for ${fixedEntityType}s.`
              : 'Track system changes and administrative actions.'}
          </p>
        </div>
        <div className="flex flex-col md:flex-row items-center gap-2 w-full md:w-auto">
          <button
            onClick={() => setIsFilterOpen(true)}
            className={`inline-flex items-center justify-center h-10 px-4 py-2 bg-white border border-gray-200 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-50 transition-colors shadow-sm w-full md:w-auto ${
              activeFiltersCount > 0 ? 'text-red-600 border-red-200 bg-red-50' : ''
            }`}
          >
            <Filter className="w-4 h-4 mr-2" />
            Filters
            {activeFiltersCount > 0 && (
              <span className="ml-2 bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-xs">
                {activeFiltersCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <SortableHeader
                  label="Date"
                  field="createdAt"
                  currentSortBy={sortBy}
                  currentSortOrder={sortOrder}
                  onSort={handleSort}
                  className="pl-6"
                />
                <th className="py-3 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Admin</th>
                <SortableHeader
                  label="Action"
                  field="action"
                  currentSortBy={sortBy}
                  currentSortOrder={sortOrder}
                  onSort={handleSort}
                />
                {!hideEntityType && (
                  <SortableHeader
                    label="Entity Type"
                    field="entityType"
                    currentSortBy={sortBy}
                    currentSortOrder={sortOrder}
                    onSort={handleSort}
                  />
                )}
                <SortableHeader
                  label="Entity ID"
                  field="entityId"
                  currentSortBy={sortBy}
                  currentSortOrder={sortOrder}
                  onSort={handleSort}
                />
                {showEntityName && (
                  <th className="py-3 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Name</th>
                )}
                <th className="py-3 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">
                  Details
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {changelogs.length === 0 ? (
                <tr>
                  <td
                    colSpan={hideEntityType ? (showEntityName ? 6 : 5) : showEntityName ? 7 : 6}
                    className="py-8 text-center text-gray-500"
                  >
                    No logs found.
                  </td>
                </tr>
              ) : (
                changelogs.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="py-4 px-6 text-sm text-gray-500 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="py-4 px-6 text-sm font-medium text-gray-900">
                      {log.admin?.name || <span className="text-gray-400 italic">System</span>}
                    </td>
                    <td className="py-4 px-6 text-sm">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium 
                        ${
                          log.action === 'CREATE' || log.action === 'BULK_CREATE'
                            ? 'bg-green-100 text-green-800'
                            : log.action === 'DELETE'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {log.action}
                      </span>
                    </td>
                    {!hideEntityType && <td className="py-4 px-6 text-sm text-gray-700">{log.entityType}</td>}
                    <td className="py-4 px-6 text-sm text-gray-500 font-mono text-xs">{log.entityId}</td>
                    {showEntityName && (
                      <td className="py-4 px-6 text-sm text-gray-700">
                        {/* Safe access to details.name if it exists */}
                        {log.details && typeof log.details === 'object' && 'name' in log.details
                          ? String((log.details as Record<string, unknown>).name)
                          : '-'}
                      </td>
                    )}
                    <td className="py-4 px-6 text-right">
                      <button
                        onClick={() => setSelectedDetails(log.details)}
                        className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
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
        details={selectedDetails}
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
        }}
      />
    </div>
  );
}
