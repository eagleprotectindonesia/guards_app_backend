'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Filter } from 'lucide-react';
import { format } from 'date-fns';
import PaginationNav from '../../components/pagination-nav';
import LeaveRequestFilterModal from './leave-request-filter-modal';
import { SerializedLeaveRequestAdminListItemDto } from '@/types/leave-requests';
import SortableHeader from '@/components/sortable-header';

type LeaveRequestListProps = {
  leaveRequests: SerializedLeaveRequestAdminListItemDto[];
  page: number;
  perPage: number;
  totalCount: number;
  employees: Array<{
    id: string;
    fullName: string;
    employeeNumber: string | null;
  }>;
  initialFilters: {
    statuses: string[];
    employeeId?: string;
    startDate?: string;
    endDate?: string;
  };
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
};

function getStatusBadgeClass(status: string) {
  switch (status) {
    case 'pending':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
    case 'approved':
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
    case 'rejected':
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
    case 'cancelled':
      return 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

export default function LeaveRequestList({
  leaveRequests,
  page,
  perPage,
  totalCount,
  employees,
  initialFilters,
  sortBy = 'startDate',
  sortOrder = 'desc',
}: LeaveRequestListProps) {
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleApplyFilters = (filters: {
    statuses: string[];
    employeeId?: string;
    startDate?: Date;
    endDate?: Date;
  }) => {
    const params = new URLSearchParams(searchParams.toString());

    params.set('page', '1');
    params.set('statuses', filters.statuses.join(','));

    if (filters.employeeId) {
      params.set('employeeId', filters.employeeId);
    } else {
      params.delete('employeeId');
    }

    if (filters.startDate) {
      params.set('startDate', format(filters.startDate, 'yyyy-MM-dd'));
    } else {
      params.delete('startDate');
    }

    if (filters.endDate) {
      params.set('endDate', format(filters.endDate, 'yyyy-MM-dd'));
    } else {
      params.delete('endDate');
    }

    router.push(`?${params.toString()}`);
  };

  const handleSort = (field: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (sortBy === field) {
      params.set('sortOrder', sortOrder === 'desc' ? 'asc' : 'desc');
    } else {
      params.set('sortBy', field);
      params.set('sortOrder', field === 'startDate' ? 'desc' : 'asc');
    }
    params.set('page', '1');
    router.push(`?${params.toString()}`);
  };

  const isDefaultStatusFilter = initialFilters.statuses.length === 1 && initialFilters.statuses[0] === 'pending';
  const activeFiltersCount = [
    initialFilters.employeeId,
    initialFilters.startDate,
    initialFilters.endDate,
    isDefaultStatusFilter ? '' : initialFilters.statuses.join(','),
  ].filter(Boolean).length;

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Leave Requests</h1>
          <p className="text-sm text-muted-foreground mt-1">Review and manage employee leave requests.</p>
        </div>
        <button
          onClick={() => setIsFilterOpen(true)}
          className={`inline-flex items-center justify-center h-10 px-4 py-2 bg-card border border-border text-foreground text-sm font-semibold rounded-lg hover:bg-muted transition-colors shadow-sm ${
            activeFiltersCount > 0
              ? 'text-red-600 border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 dark:text-red-400'
              : ''
          }`}
        >
          <Filter className="w-4 h-4 mr-2" />
          Filters
          {activeFiltersCount > 0 && (
            <span className="ml-2 bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 px-2 py-0.5 rounded-full text-xs">
              {activeFiltersCount}
            </span>
          )}
        </button>
      </div>

      <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Employee</th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Reason</th>
                <SortableHeader
                  label="Date Range"
                  field="startDate"
                  currentSortBy={sortBy}
                  currentSortOrder={sortOrder}
                  onSort={handleSort}
                  className="text-muted-foreground hover:bg-muted/80"
                />
                <SortableHeader
                  label="Status"
                  field="status"
                  currentSortBy={sortBy}
                  currentSortOrder={sortOrder}
                  onSort={handleSort}
                  className="text-muted-foreground hover:bg-muted/80"
                />
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Submitted</th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {leaveRequests.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground">
                    No leave requests found.
                  </td>
                </tr>
              ) : (
                leaveRequests.map(leaveRequest => (
                  <tr key={leaveRequest.id} className="hover:bg-muted/30 transition-colors">
                    <td className="py-4 px-6 text-sm">
                      <div className="font-medium text-foreground">{leaveRequest.employee.fullName}</div>
                      <div className="text-xs text-muted-foreground">{leaveRequest.employee.employeeNumber || '-'}</div>
                    </td>
                    <td className="py-4 px-6 text-sm text-muted-foreground">
                      <div className="capitalize">{leaveRequest.reason}</div>
                    </td>
                    <td className="py-4 px-6 text-sm text-muted-foreground">
                      {format(new Date(leaveRequest.startDate), 'yyyy/MM/dd')} -{' '}
                      {format(new Date(leaveRequest.endDate), 'yyyy/MM/dd')}
                    </td>
                    <td className="py-4 px-6 text-sm">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeClass(
                          leaveRequest.status
                        )}`}
                      >
                        {leaveRequest.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-sm text-muted-foreground">
                      {format(new Date(leaveRequest.createdAt), 'yyyy/MM/dd HH:mm')}
                    </td>
                    <td className="py-4 px-6 text-right">
                      <Link
                        href={`/admin/leave-requests/${leaveRequest.id}`}
                        className="inline-flex items-center justify-center h-9 px-3 py-2 bg-card border border-border text-foreground text-xs font-semibold rounded-lg hover:bg-muted transition-colors"
                      >
                        View Detail
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <PaginationNav page={page} perPage={perPage} totalCount={totalCount} />

      <LeaveRequestFilterModal
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        onApply={handleApplyFilters}
        initialFilters={initialFilters}
        employees={employees}
      />
    </div>
  );
}
