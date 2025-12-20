'use client';

import { useState, useTransition } from 'react';
import { Guard } from '@prisma/client';
import { Serialized } from '@/lib/utils';
import { deleteGuard, getAllGuardsForExport } from '../actions';
import ConfirmDialog from '../../components/confirm-dialog';
import ChangePasswordModal from './change-password-modal';
import BulkCreateModal from './bulk-create-modal';
import GuardFilterModal from './guard-filter-modal';
import { DeleteButton } from '../../components/action-buttons';
import PaginationNav from '../../components/pagination-nav';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { Pencil, Key, Download, Upload } from 'lucide-react';
import Search from '../../components/search';
import { useRouter, useSearchParams } from 'next/navigation';
import SortableHeader from '@/components/sortable-header';
import { format } from 'date-fns';

type GuardWithUpdater = Guard & {
  lastUpdatedBy?: { name: string } | null;
};

type GuardListProps = {
  guards: Serialized<GuardWithUpdater>[];
  page: number;
  perPage: number;
  totalCount: number;
  sortBy?: 'name' | 'employeeId' | 'guardCode' | 'joinDate';
  sortOrder?: 'asc' | 'desc';
  startDate?: string;
  endDate?: string;
};

export default function GuardList({
  guards,
  page,
  perPage,
  totalCount,
  sortBy = 'joinDate',
  sortOrder = 'desc',
  startDate,
  endDate,
}: GuardListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [passwordModalData, setPasswordModalData] = useState<{ id: string; name: string } | null>(null);
  const [isBulkCreateOpen, setIsBulkCreateOpen] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

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
    router.push(`/admin/guards?${params.toString()}`);
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
    router.push(`/admin/guards?${params.toString()}`);
  };

  const handleDeleteClick = (id: string) => {
    setDeleteId(id);
  };

  const handleConfirmDelete = () => {
    if (!deleteId) return;

    startTransition(async () => {
      const result = await deleteGuard(deleteId);
      if (result.success) {
        toast.success('Guard deleted successfully!');
        setDeleteId(null);
      } else {
        toast.error(result.message || 'Failed to delete guard.');
      }
    });
  };

  const handleExportCSV = async () => {
    try {
      const guards = await getAllGuardsForExport();

      const headers = ['Name', 'Phone', 'Employee ID', 'Guard Code', 'Status', 'Joined Date', 'Left Date', 'Note'];
      const csvContent = [
        headers.join(','),
        ...guards.map(guard => {
          return [
            `"${guard.name}"`, 
            `"${guard.phone}"`, 
            `"${guard.employeeId}"`,
            `"${guard.guardCode || ''}"`, 
            guard.status ? 'Active' : 'Inactive',
            `"${guard.joinDate ? new Date(guard.joinDate).toLocaleDateString() : ''}"`, 
            `"${guard.leftDate ? new Date(guard.leftDate).toLocaleDateString() : ''}"`, 
            `"${guard.note ? guard.note.replace(/"/g, '""') : ''}"`, 
          ].join(',');
        }),
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `guards_export_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Failed to export guards:', error);
      toast.error('Failed to export guards.');
    }
  };

  const activeFiltersCount = [startDate, endDate].filter(Boolean).length;

  return (
    <div>
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Guards</h1>
          <p className="text-sm text-gray-500 mt-1">Manage security personnel and contact info.</p>
        </div>
        <div className="flex flex-col md:flex-row items-center gap-2 w-full md:w-auto">
          <div className="w-full md:w-64">
            <Search placeholder="Search guards..." />
          </div>
          <button
            onClick={() => setIsFilterOpen(true)}
            className={`inline-flex items-center justify-center h-10 px-4 py-2 bg-white border border-gray-200 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-50 transition-colors shadow-sm w-full md:w-auto ${
              activeFiltersCount > 0 ? 'text-red-600 border-red-200 bg-red-50' : ''
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
              <span className="ml-2 bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-xs">
                {activeFiltersCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setIsBulkCreateOpen(true)}
            className="inline-flex items-center justify-center h-10 px-4 py-2 bg-white text-gray-700 text-sm font-semibold rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors shadow-sm w-full md:w-auto"
          >
            <Upload className="mr-2 h-4 w-4" />
            Upload CSV
          </button>
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center justify-center h-10 px-4 py-2 bg-white text-gray-700 text-sm font-semibold rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors shadow-sm w-full md:w-auto"
          >
            <Download className="mr-2 h-4 w-4" />
            Download CSV
          </button>
          <Link
            href="/admin/guards/create"
            className="inline-flex items-center justify-center h-10 px-4 py-2 bg-red-500 text-white text-sm font-semibold rounded-lg hover:bg-red-600 transition-colors shadow-sm shadow-red-500/30 w-full md:w-auto"
          >
            <span className="mr-2 text-lg leading-none">+</span>
            Add Guard
          </Link>
        </div>
      </div>

      {/* Table Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <SortableHeader
                  label="Employee ID"
                  field="employeeId"
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
                <th className="py-3 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider text-center">Phone</th>
                <SortableHeader
                  label="Guard Code"
                  field="guardCode"
                  currentSortBy={sortBy}
                  currentSortOrder={sortOrder}
                  onSort={handleSort}
                  className="text-center"
                />
                <th className="py-3 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider text-center">Status</th>
                <SortableHeader
                  label="Joined Date"
                  field="joinDate"
                  currentSortBy={sortBy}
                  currentSortOrder={sortOrder}
                  onSort={handleSort}
                  className="text-center"
                />
                <th className="py-3 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider text-center">Left Date</th>
                <th className="py-3 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider text-center">Last Updated By</th>
                <th className="py-3 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider text-center">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {guards.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-gray-500">
                    No guards found. Add one to get started.
                  </td>
                </tr>
              ) : (
                guards.map(guard => (
                  <tr key={guard.id} className="hover:bg-gray-50/50 transition-colors group">
                    <td className="py-4 px-6 text-sm text-gray-600">{guard.employeeId}</td>
                    <td className="py-4 px-6 text-sm font-medium text-gray-900">
                      <div className="flex items-center gap-3">
                        {/* Avatar Placeholder */}
                        <div className="w-8 h-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-xs font-bold">
                          {guard.name.substring(0, 2).toUpperCase()}
                        </div>
                        {guard.name}
                      </div>
                    </td>
                    <td className="py-4 px-6 text-sm text-gray-600 font-mono">{guard.phone}</td>
                    <td className="py-4 px-6 text-sm text-gray-600">{guard.guardCode || '-'}</td>
                    <td className="py-4 px-6 text-sm">
                      {guard.status !== false ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-6 text-sm text-gray-500">
                      {new Date(guard.joinDate || guard.createdAt).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </td>
                    <td className="py-4 px-6 text-sm text-gray-500">
                      {guard.leftDate ? new Date(guard.leftDate).toLocaleDateString() : '-'}
                    </td>
                    <td className="py-4 px-6 text-sm text-gray-500">
                      {guard.lastUpdatedBy?.name || '-'}
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-100">
                        <Link
                          href={`/admin/guards/${guard.id}/edit`}
                          className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                          <span className="sr-only">Edit</span>
                        </Link>
                        <DeleteButton onClick={() => handleDeleteClick(guard.id)} disabled={isPending} />
                        <button
                          type="button"
                          onClick={() => setPasswordModalData({ id: guard.id, name: guard.name })}
                          className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                          title="Change Password"
                        >
                          <Key className="w-4 h-4" />
                          <span className="sr-only">Change Password</span>
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
        title="Delete Guard"
        description="Are you sure you want to delete this guard? This action cannot be undone and will remove all associated history."
        confirmText="Delete Guard"
        isPending={isPending}
      />

      <BulkCreateModal isOpen={isBulkCreateOpen} onClose={() => setIsBulkCreateOpen(false)} />

      <GuardFilterModal
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
          guardId={passwordModalData.id}
          guardName={passwordModalData.name}
        />
      )}
    </div>
  );
}