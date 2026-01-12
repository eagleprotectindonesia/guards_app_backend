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
import { Pencil, Key, Download, Upload, History, MessageSquare } from 'lucide-react';
import Search from '../../components/search';
import { useRouter, useSearchParams } from 'next/navigation';
import SortableHeader from '@/components/sortable-header';
import { format } from 'date-fns';

type GuardWithAdminInfo = Guard & {
  lastUpdatedBy?: { name: string } | null;
  createdBy?: { name: string } | null;
};

type GuardListProps = {
  guards: Serialized<GuardWithAdminInfo>[];
  page: number;
  perPage: number;
  totalCount: number;
  sortBy?: 'name' | 'id' | 'guardCode' | 'joinDate';
  sortOrder?: 'asc' | 'desc';
  startDate?: string;
  endDate?: string;
  isSuperAdmin?: boolean;
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
  isSuperAdmin = false,
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

      const headers = [
        'Name',
        'Phone',
        'Employee ID',
        'Guard Code',
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
        ...guards.map(guard => {
          const phone = guard.phone.split('#')[0];
          return [
            `"${guard.name}"`,
            `"${phone}"`,
            `"${guard.id}"`,
            `"${guard.guardCode || ''}"`,
            guard.status ? 'Active' : 'Inactive',
            `"${guard.joinDate ? format(new Date(guard.joinDate), 'yyyy/MM/dd') : ''}"`,
            `"${guard.leftDate ? format(new Date(guard.leftDate), 'yyyy/MM/dd') : ''}"`,
            `"${guard.note ? guard.note.replace(/"/g, '""') : ''}"`,
            `"${guard.createdBy?.name || ''}"`,
            `"${format(new Date(guard.createdAt), 'yyyy/MM/dd HH:mm')}"`,
            `"${guard.lastUpdatedBy?.name || ''}"`,
            `"${guard.deletedAt ? format(new Date(guard.deletedAt), 'yyyy/MM/dd HH:mm') : ''}"`,
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
          <h1 className="text-2xl font-bold text-foreground">Guards</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage security personnel and contact info.</p>
        </div>
        <div className="flex flex-col md:flex-row items-center gap-2 w-full md:w-auto">
          <div className="w-full md:w-64">
            <Search placeholder="Search guards..." />
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
          <button
            onClick={() => setIsBulkCreateOpen(true)}
            className="inline-flex items-center justify-center h-10 px-4 py-2 bg-card text-foreground text-sm font-semibold rounded-lg border border-border hover:bg-muted/50 transition-colors shadow-sm w-full md:w-auto"
          >
            <Upload className="mr-2 h-4 w-4" />
            Upload CSV
          </button>
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center justify-center h-10 px-4 py-2 bg-card text-foreground text-sm font-semibold rounded-lg border border-border hover:bg-muted/50 transition-colors shadow-sm w-full md:w-auto"
          >
            <Download className="mr-2 h-4 w-4" />
            Download CSV
          </button>
          {isSuperAdmin && (
            <Link
              href="/admin/guards/audit"
              className="inline-flex items-center justify-center h-10 px-4 py-2 bg-card text-foreground text-sm font-semibold rounded-lg border border-border hover:bg-muted/50 transition-colors shadow-sm w-full md:w-auto"
            >
              <History className="mr-2 h-4 w-4" />
              Audit Log
            </Link>
          )}
          <Link
            href="/admin/guards/create"
            className="inline-flex items-center justify-center h-10 px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition-colors shadow-sm shadow-red-500/20 w-full md:w-auto"
          >
            <span className="mr-2 text-lg leading-none">+</span>
            Add Guard
          </Link>
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
                  label="Guard Code"
                  field="guardCode"
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
              {guards.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-muted-foreground">
                    No guards found. Add one to get started.
                  </td>
                </tr>
              ) : (
                guards.map(guard => (
                  <tr key={guard.id} className="hover:bg-muted/30 transition-colors group">
                    <td className="py-4 px-6 text-sm text-muted-foreground">{guard.id}</td>
                    <td className="py-4 px-6 text-sm font-medium text-foreground">
                      <div className="flex items-center gap-3">
                        {/* Avatar Placeholder */}
                        <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 flex items-center justify-center text-xs font-bold">
                          {guard.name.substring(0, 2).toUpperCase()}
                        </div>
                        {guard.name}
                      </div>
                    </td>
                    <td className="py-4 px-6 text-sm text-muted-foreground font-mono">{guard.phone}</td>
                    <td className="py-4 px-6 text-sm text-muted-foreground">{guard.guardCode || '-'}</td>
                    <td className="py-4 px-6 text-sm">
                      {guard.status !== false ? (
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
                      {format(new Date(guard.joinDate || guard.createdAt), 'yyyy/MM/dd')}
                    </td>
                    <td className="py-4 px-6 text-sm text-muted-foreground">
                      {guard.leftDate ? format(new Date(guard.leftDate), 'yyyy/MM/dd') : '-'}
                    </td>
                    <td className="py-4 px-6 text-sm text-muted-foreground">
                      <div className="max-w-[200px] whitespace-normal wrap-break-words">{guard.note || '-'}</div>
                    </td>
                    <td className="py-4 px-6 text-sm text-muted-foreground text-center">
                      <div className="flex flex-col items-center gap-1">
                        <div 
                          className={`px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${
                            guard.createdBy?.name 
                              ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30' 
                              : 'text-muted-foreground/50'
                          }`} 
                          title="Created By"
                        >
                          {guard.createdBy?.name || '-'}
                        </div>
                        <div 
                          className={`px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${
                            guard.lastUpdatedBy?.name 
                              ? 'bg-muted text-foreground border border-border' 
                              : 'text-muted-foreground/50'
                          }`} 
                          title="Last Updated By"
                        >
                          {guard.lastUpdatedBy?.name || '-'}
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-100">
                        <Link
                          href={`/admin/guards/${guard.id}/edit`}
                          className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors cursor-pointer"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                          <span className="sr-only">Edit</span>
                        </Link>
                        <DeleteButton
                          onClick={() => handleDeleteClick(guard.id)}
                          disabled={!isSuperAdmin || isPending}
                          title={!isSuperAdmin ? 'Only Super Admins can delete' : 'Delete'}
                        />
                        <button
                          type="button"
                          onClick={() => setPasswordModalData({ id: guard.id, name: guard.name })}
                          className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors cursor-pointer"
                          title="Change Password"
                        >
                          <Key className="w-4 h-4" />
                          <span className="sr-only">Change Password</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => window.dispatchEvent(new CustomEvent('open-admin-chat', { detail: { guardId: guard.id } }))}
                          className="p-2 text-blue-500 hover:text-blue-700 hover:bg-blue-900/30 rounded-lg transition-colors cursor-pointer"
                          title="Chat with Guard"
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
