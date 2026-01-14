'use client';

import { useState, useTransition } from 'react';
import { Employee } from '@prisma/client';
import { Serialized } from '@/lib/utils';
import { deleteEmployee, getAllEmployeesForExport } from '../actions';
import ConfirmDialog from '../../components/confirm-dialog';
import ChangePasswordModal from './change-password-modal';
import BulkCreateModal from './bulk-create-modal';
import EmployeeFilterModal from './employee-filter-modal';
import { EditButton, DeleteButton } from '../../components/action-buttons';
import PaginationNav from '../../components/pagination-nav';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { Key, Download, Upload, History, MessageSquare } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import SortableHeader from '@/components/sortable-header';
import { format } from 'date-fns';
import Search from '../../components/search';
import { useSession } from '../../context/session-context';
import { PERMISSIONS } from '@/lib/auth/permissions';

type EmployeeWithAdminInfo = Employee & {
  lastUpdatedBy?: { name: string } | null;
  createdBy?: { name: string } | null;
};

type EmployeeListProps = {
  employees: Serialized<EmployeeWithAdminInfo>[];
  page: number;
  perPage: number;
  totalCount: number;
  sortBy?: 'name' | 'id' | 'employeeCode' | 'joinDate';
  sortOrder?: 'asc' | 'desc';
  startDate?: string;
  endDate?: string;
};

export default function EmployeeList({
  employees,
  page,
  perPage,
  totalCount,
  sortBy = 'joinDate',
  sortOrder = 'desc',
  startDate,
  endDate,
}: EmployeeListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { hasPermission } = useSession();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [passwordModalData, setPasswordModalData] = useState<{ id: string; name: string } | null>(null);
  const [isBulkCreateOpen, setIsBulkCreateOpen] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const canCreate = hasPermission(PERMISSIONS.EMPLOYEES.CREATE);
  const canEdit = hasPermission(PERMISSIONS.EMPLOYEES.EDIT);
  const canDelete = hasPermission(PERMISSIONS.EMPLOYEES.DELETE);
  const canViewAudit = hasPermission(PERMISSIONS.CHANGELOGS.VIEW);

  const handleSort = (field: string) => {
    const params = new URLSearchParams(searchParams.toString());

    // Determine the new sort order
    if (sortBy === field) {
      // If clicking the same field, toggle the sort order
      const newSortOrder = sortOrder === 'desc' ? 'asc' : 'desc';
      params.set('sortOrder', newSortOrder);
    } else {
      // If clicking a different field, set to new field and default to descending
      params.set('sortBy', field);
      params.set('sortOrder', 'desc');
    }

    // Reset to page 1 when sorting
    params.set('page', '1');

    // Navigate to the new URL
    router.push(`/admin/employees?${params.toString()}`);
  };

  const handleApplyFilter = (filters: { startDate?: Date; endDate?: Date }) => {
    const params = new URLSearchParams(searchParams.toString());

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

    params.set('page', '1');
    router.push(`/admin/employees?${params.toString()}`);
  };

  const handleDeleteClick = (id: string) => {
    if (!canDelete) return;
    setDeleteId(id);
  };

  const handleConfirmDelete = () => {
    if (!deleteId || !canDelete) return;

    startTransition(async () => {
      const result = await deleteEmployee(deleteId);
      if (result.success) {
        toast.success('Employee deleted successfully!');
        setDeleteId(null);
      } else {
        toast.error(result.message || 'Failed to delete employee.');
      }
    });
  };

  const handleExportCSV = async () => {
    try {
      const employees = await getAllEmployeesForExport();

      const headers = [
        'Name',
        'Phone',
        'Employee ID',
        'Employee Code',
        'Status',
        'Joined Date',
        'Left Date',
        'Note',
        'Created By',
        'Created At',
        'Last Updated By',
        'Deleted At',
      ];
      const csvContent = [
        headers.join(','),
        ...employees.map(employee => {
          const phone = employee.phone.split('#')[0];
          return [
            `"${employee.name}"`,
            `"${phone}"`,
            `"${employee.id}"`,
            `"${employee.employeeCode || ''}"`,
            employee.status ? 'Active' : 'Inactive',
            `"${employee.joinDate ? format(new Date(employee.joinDate), 'yyyy/MM/dd') : ''}"`,
            `"${employee.leftDate ? format(new Date(employee.leftDate), 'yyyy/MM/dd') : ''}"`,
            `"${employee.note ? employee.note.replace(/"/g, '""') : ''}"`,
            `"${employee.createdBy?.name || ''}"`,
            `"${format(new Date(employee.createdAt), 'yyyy/MM/dd HH:mm')}"`,
            `"${employee.lastUpdatedBy?.name || ''}"`,
            `"${employee.deletedAt ? format(new Date(employee.deletedAt), 'yyyy/MM/dd HH:mm') : ''}"`,
          ].join(',');
        }),
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `employees_export_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Failed to export employees:', error);
      toast.error('Failed to export employees.');
    }
  };

  const activeFiltersCount = [startDate, endDate].filter(Boolean).length;

  return (
    <div>
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Employees</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage personnel and contact info.</p>
        </div>
        <div className="flex flex-col md:flex-row items-center gap-2 w-full md:w-auto">
          <div className="w-full md:w-64">
            <Search placeholder="Search employees..." />
          </div>
          <button
            onClick={() => setIsFilterOpen(true)}
            className={`inline-flex items-center justify-center h-10 px-4 py-2 bg-card border border-border text-foreground text-sm font-semibold rounded-lg hover:bg-muted/50 transition-colors shadow-sm w-full md:w-auto ${
              activeFiltersCount > 0 ? 'text-red-600 border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-900/30' : ''
            }`}
          >
            <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
              />
            </svg>
            Filters
            {activeFiltersCount > 0 && (
              <span className="ml-2 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 px-2 py-0.5 rounded-full text-xs">
                {activeFiltersCount}
              </span>
            )}
          </button>
          {canCreate && (
            <>
              <button
                onClick={() => setIsBulkCreateOpen(true)}
                className="inline-flex items-center justify-center h-10 px-4 py-2 bg-card text-foreground text-sm font-semibold rounded-lg border border-border hover:bg-muted/50 transition-colors shadow-sm w-full md:w-auto"
              >
                <Upload className="mr-2 h-4 w-4" />
                Upload CSV
              </button>
            </>
          )}
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center justify-center h-10 px-4 py-2 bg-card text-foreground text-sm font-semibold rounded-lg border border-border hover:bg-muted/50 transition-colors shadow-sm w-full md:w-auto"
          >
            <Download className="mr-2 h-4 w-4" />
            Download CSV
          </button>
          {canViewAudit && (
            <Link
              href="/admin/employees/audit"
              className="inline-flex items-center justify-center h-10 px-4 py-2 bg-card text-foreground text-sm font-semibold rounded-lg border border-border hover:bg-muted/50 transition-colors shadow-sm w-full md:w-auto"
            >
              <History className="mr-2 h-4 w-4" />
              Audit Log
            </Link>
          )}
          {canCreate && (
            <Link
              href="/admin/employees/create"
              className="inline-flex items-center justify-center h-10 px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition-colors shadow-sm shadow-red-500/20 w-full md:w-auto"
            >
              <span className="mr-2 text-lg leading-none">+</span>
              Add Employee
            </Link>
          )}
        </div>
      </div>

      {/* Table Section */}
      <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <SortableHeader
                  label="Employee ID"
                  field="id"
                  currentSortBy={sortBy}
                  currentSortOrder={sortOrder}
                  onSort={handleSort}
                  className="text-center"
                />
                <SortableHeader
                  label="Name"
                  field="name"
                  currentSortBy={sortBy}
                  currentSortOrder={sortOrder}
                  onSort={handleSort}
                  className="text-center"
                />
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider text-center">
                  Phone
                </th>
                <SortableHeader
                  label="Employee Code"
                  field="employeeCode"
                  currentSortBy={sortBy}
                  currentSortOrder={sortOrder}
                  onSort={handleSort}
                  className="text-center"
                />
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider text-center">
                  Status
                </th>
                <SortableHeader
                  label="Joined Date"
                  field="joinDate"
                  currentSortBy={sortBy}
                  currentSortOrder={sortOrder}
                  onSort={handleSort}
                  className="text-center"
                />
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider text-center">
                  Left Date
                </th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider text-center">Note</th>
                <th className="py-3 px-6 text-[10px] font-bold text-muted-foreground uppercase tracking-wider text-center">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-blue-600 dark:text-blue-400">Created By</span>
                    <span className="text-muted-foreground/60">Last Updated By</span>
                  </div>
                </th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider text-center">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {employees.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-muted-foreground">
                    No employees found. Add one to get started.
                  </td>
                </tr>
              ) : (
                employees.map(employee => (
                  <tr key={employee.id} className="hover:bg-muted/30 transition-colors group">
                    <td className="py-4 px-6 text-sm text-muted-foreground">{employee.id}</td>
                    <td className="py-4 px-6 text-sm font-medium text-foreground">
                      <div className="flex items-center gap-3">
                        {/* Avatar Placeholder */}
                        <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 flex items-center justify-center text-xs font-bold">
                          {employee.name.substring(0, 2).toUpperCase()}
                        </div>
                        {employee.name}
                      </div>
                    </td>
                    <td className="py-4 px-6 text-sm text-muted-foreground font-mono">{employee.phone}</td>
                    <td className="py-4 px-6 text-sm text-muted-foreground">{employee.employeeCode || '-'}</td>
                    <td className="py-4 px-6 text-sm">
                      {employee.status !== false ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-6 text-sm text-muted-foreground">
                      {format(new Date(employee.joinDate || employee.createdAt), 'yyyy/MM/dd')}
                    </td>
                    <td className="py-4 px-6 text-sm text-muted-foreground">
                      {employee.leftDate ? format(new Date(employee.leftDate), 'yyyy/MM/dd') : '-'}
                    </td>
                    <td className="py-4 px-6 text-sm text-muted-foreground">
                      <div className="max-w-[200px] whitespace-normal wrap-break-words">{employee.note || '-'}</div>
                    </td>
                    <td className="py-4 px-6 text-sm text-muted-foreground text-center">
                      <div className="flex flex-col items-center gap-1">
                        <div 
                          className={`px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${
                            employee.createdBy?.name 
                              ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30' 
                              : 'text-muted-foreground/50'
                          }`} 
                          title="Created By"
                        >
                          {employee.createdBy?.name || '-'}
                        </div>
                        <div 
                          className={`px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${
                            employee.lastUpdatedBy?.name 
                              ? 'bg-muted text-foreground border border-border' 
                              : 'text-muted-foreground/50'
                          }`} 
                          title="Last Updated By"
                        >
                          {employee.lastUpdatedBy?.name || '-'}
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-100">
                        <EditButton
                          href={`/admin/employees/${employee.id}/edit`}
                          disabled={!canEdit}
                          title={!canEdit ? 'Permission Denied' : 'Edit'}
                        />
                        <DeleteButton
                          onClick={() => handleDeleteClick(employee.id)}
                          disabled={!canDelete || isPending}
                          title={!canDelete ? 'Permission Denied' : 'Delete'}
                        />
                        <button
                          type="button"
                          onClick={() => setPasswordModalData({ id: employee.id, name: employee.name })}
                          disabled={!canEdit}
                          className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors cursor-pointer disabled:text-muted-foreground/30 disabled:cursor-not-allowed"
                          title={!canEdit ? 'Permission Denied' : 'Change Password'}
                        >
                          <Key className="w-4 h-4" />
                          <span className="sr-only">Change Password</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => window.dispatchEvent(new CustomEvent('open-admin-chat', { detail: { employeeId: employee.id } }))}
                          className="p-2 text-blue-500 hover:text-blue-700 hover:bg-blue-900/30 rounded-lg transition-colors cursor-pointer"
                          title="Chat with Employee"
                        >
                          <MessageSquare className="w-4 h-4" />
                          <span className="sr-only">Chat</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <PaginationNav page={page} perPage={perPage} totalCount={totalCount} />

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Employee"
        description="Are you sure you want to delete this employee? This action cannot be undone and will remove all associated history."
        confirmText="Delete Employee"
        isPending={isPending}
      />

      <BulkCreateModal isOpen={isBulkCreateOpen} onClose={() => setIsBulkCreateOpen(false)} />

      <EmployeeFilterModal
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        onApply={handleApplyFilter}
        initialFilters={{
          startDate,
          endDate,
        }}
      />

      {passwordModalData && (
        <ChangePasswordModal
          isOpen={true}
          onClose={() => setPasswordModalData(null)}
          employeeId={passwordModalData.id}
          employeeName={passwordModalData.name}
        />
      )}
    </div>
  );
}
