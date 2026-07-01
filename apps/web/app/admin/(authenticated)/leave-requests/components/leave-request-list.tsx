'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Download } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import PaginationNav from '../../components/pagination-nav';
import LeaveExportModal from './leave-export-modal';
import { SerializedLeaveRequestAdminListItemDto } from '@/types/leave-requests';
import SortableHeader from '@/components/sortable-header';
import { getLeaveReasonMeta } from '@/lib/leave-requests';
import { useAdminRouter } from '../../context/admin-router';
import { getLeaveRequestReviewerName } from './leave-request-list-utils';
import { DateRangeFilter, SelectFilter, FilterBar, useFilterUrlSync } from '../../components/filters';

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
    reasons: string[];
    categories: string[];
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
    case 'pending_hr':
    case 'pending_manager':
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

function formatStatusLabel(status: string) {
  switch (status) {
    case 'pending_hr':
      return 'PENDING HR';
    case 'pending_manager':
      return 'PENDING MANAGER';
    default:
      return status.toUpperCase();
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
  const [isExportOpen, setIsExportOpen] = useState(false);
  const router = useAdminRouter();
  const searchParams = useSearchParams();
  const { apply } = useFilterUrlSync('');

  const [filterStatus, setFilterStatus] = useState(initialFilters.statuses[0] || '');
  const [filterReason, setFilterReason] = useState(initialFilters.reasons[0] || '');
  const [filterCategory, setFilterCategory] = useState(initialFilters.categories[0] || '');
  const [filterEmployeeId, setFilterEmployeeId] = useState(initialFilters.employeeId || '');
  const [filterStartDate, setFilterStartDate] = useState<Date | undefined>(
    initialFilters.startDate ? parseISO(initialFilters.startDate) : undefined
  );
  const [filterEndDate, setFilterEndDate] = useState<Date | undefined>(
    initialFilters.endDate ? parseISO(initialFilters.endDate) : undefined
  );

  const handleApplyFilters = () => {
    apply({
      statuses: filterStatus || null,
      reasons: filterReason || null,
      categories: filterCategory || null,
      employeeId: filterEmployeeId || null,
      startDate: filterStartDate ? format(filterStartDate, 'yyyy-MM-dd') : null,
      endDate: filterEndDate ? format(filterEndDate, 'yyyy-MM-dd') : null,
    });
  };

  const handleClearFilters = () => {
    setFilterStatus('');
    setFilterReason('');
    setFilterCategory('');
    setFilterEmployeeId('');
    setFilterStartDate(undefined);
    setFilterEndDate(undefined);
    apply({
      statuses: null,
      reasons: null,
      categories: null,
      employeeId: null,
      startDate: null,
      endDate: null,
    });
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

  const handleExportCsv = (startDate?: Date, endDate?: Date) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('page');

    if (startDate) {
      params.set('startDate', format(startDate, 'yyyy-MM-dd'));
    } else {
      params.delete('startDate');
    }

    if (endDate) {
      params.set('endDate', format(endDate, 'yyyy-MM-dd'));
    } else {
      params.delete('endDate');
    }

    window.location.href = '/api/admin/leave-requests/export?' + params.toString();
  };

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Leave Requests</h1>
          <p className="text-sm text-muted-foreground mt-1">Review and manage employee leave requests.</p>
        </div>
        <div className="flex gap-2 items-center">
          <Link
            href="/admin/leave-balances"
            onClick={event => {
              event.preventDefault();
              router.push('/admin/leave-balances');
            }}
            className="inline-flex items-center justify-center h-10 px-4 py-2 bg-card border border-border text-foreground text-sm font-semibold rounded-lg hover:bg-muted transition-colors shadow-sm"
          >
            Leave Balances
          </Link>
          <button
            onClick={() => setIsExportOpen(true)}
            className="inline-flex items-center justify-center h-10 px-4 py-2 bg-card border border-border text-foreground text-sm font-semibold rounded-lg hover:bg-muted transition-colors shadow-sm"
          >
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      <FilterBar onApply={handleApplyFilters} onClear={handleClearFilters}>
        <SelectFilter
          label="Status"
          value={filterStatus}
          options={[
            { value: 'pending', label: 'Pending' },
            { value: 'pending_hr', label: 'Pending HR Approval' },
            { value: 'pending_manager', label: 'Pending Manager Approval' },
            { value: 'approved', label: 'Approved' },
            { value: 'rejected', label: 'Rejected' },
            { value: 'cancelled', label: 'Cancelled' },
          ]}
          onChange={setFilterStatus}
          id="filter-status"
          instanceId="filter-status"
          allLabel="All statuses"
        />
        <SelectFilter
          label="Category"
          value={filterCategory}
          options={[
            { value: 'sick', label: 'Sick' },
            { value: 'family', label: 'Family' },
            { value: 'special', label: 'Special' },
            { value: 'annual', label: 'Annual' },
          ]}
          onChange={setFilterCategory}
          id="filter-category"
          instanceId="filter-category"
          allLabel="All categories"
        />
        <SelectFilter
          label="Leave Type"
          value={filterReason}
          options={[
            { value: 'sick', label: 'Sick Leave' },
            { value: 'family_marriage', label: 'Marriage Leave' },
            { value: 'family_child_marriage', label: 'Child Marriage' },
            { value: 'family_child_circumcision_baptism', label: 'Child Circumcision/Baptism' },
            { value: 'family_death', label: 'Death of Family Member' },
            { value: 'family_spouse_death', label: 'Spouse Death' },
            { value: 'special_maternity', label: 'Maternity Leave' },
            { value: 'special_miscarriage', label: 'Miscarriage Leave' },
            { value: 'special_paternity', label: 'Paternity Leave' },
            { value: 'special_emergency', label: 'Emergency Leave' },
            { value: 'annual', label: 'Annual Leave' },
          ]}
          onChange={setFilterReason}
          id="filter-reason"
          instanceId="filter-reason"
          allLabel="All leave types"
        />
        <SelectFilter
          label="Employee"
          value={filterEmployeeId}
          options={employees.map(e => ({ value: e.id, label: `${e.fullName}${e.employeeNumber ? ` (${e.employeeNumber})` : ''}` }))}
          onChange={setFilterEmployeeId}
          id="filter-employee"
          instanceId="filter-employee"
          allLabel="All employees"
        />
        <DateRangeFilter
          from={filterStartDate}
          to={filterEndDate}
          onChange={(from, to) => {
            setFilterStartDate(from);
            setFilterEndDate(to);
          }}
        />
      </FilterBar>

      <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider w-12 text-center">#</th>
                <SortableHeader label="Employee" field="employee" currentSortBy={sortBy} currentSortOrder={sortOrder} onSort={handleSort} />
                <SortableHeader label="Reason" field="reason" currentSortBy={sortBy} currentSortOrder={sortOrder} onSort={handleSort} />
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
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Reviewer</th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Submitted</th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {leaveRequests.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-muted-foreground">
                    No leave requests found.
                  </td>
                </tr>
              ) : (
                leaveRequests.map(leaveRequest => {
                  const reasonMeta = getLeaveReasonMeta(leaveRequest.reason);
                  const reviewerName = getLeaveRequestReviewerName(leaveRequest);
                  return (
                    <tr key={leaveRequest.id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-4 px-6 text-sm text-muted-foreground text-center">{leaveRequests.indexOf(leaveRequest) + 1 + (page - 1) * perPage}</td>
                      <td className="py-4 px-6 text-sm">
                        <div className="font-medium text-foreground">{leaveRequest.employee.fullName}</div>
                        <div className="text-xs text-muted-foreground">{leaveRequest.employee.employeeNumber || '-'}</div>
                      </td>
                      <td className="py-4 px-6 text-sm text-muted-foreground">
                        <div className="text-foreground">{reasonMeta.label}</div>
                        <div className="text-xs uppercase text-muted-foreground mt-0.5">{reasonMeta.category}</div>
                      </td>
                      <td className="py-4 px-6 text-sm text-muted-foreground">
                        {format(new Date(leaveRequest.startDate), 'yyyy/MM/dd')} -{' '}
                        {format(new Date(leaveRequest.endDate), 'yyyy/MM/dd')}
                      </td>
                      <td className="py-4 px-6 text-sm">
                        <span
                          className={`inline-flex w-fit items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeClass(
                            leaveRequest.status
                          )}`}
                        >
                          {formatStatusLabel(leaveRequest.status)}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-sm text-muted-foreground">
                        {reviewerName || '-'}
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
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <PaginationNav page={page} perPage={perPage} totalCount={totalCount} />

      <LeaveExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        initialStartDate={initialFilters.startDate}
        initialEndDate={initialFilters.endDate}
        onExport={handleExportCsv}
      />
    </div>
  );
}
