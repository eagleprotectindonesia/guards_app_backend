'use client';

import { deleteOffice, getAllOfficesForExport } from '../actions';
import { DeleteButton, EditButton } from '../../components/action-buttons';
import { Office } from '@prisma/client';
import type { Serialized } from '@/lib/server-utils';
import PaginationNav from '../../components/pagination-nav';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { History, Download } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import SortableHeader from '@/components/sortable-header';
import ConfirmDialog from '../../components/confirm-dialog';
import Search from '../../components/search';
import { format } from 'date-fns';
import { useSession } from '../../context/session-context';
import { useAdminRouter } from '../../context/admin-router';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { useState } from 'react';

type OfficeWithAdminInfo = Office & {
  lastUpdatedBy?: { name: string } | null;
  createdBy?: { name: string } | null;
};

type OfficeListProps = {
  offices: Serialized<OfficeWithAdminInfo>[];
  page: number;
  perPage: number;
  totalCount: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
};

export default function OfficeList({ offices, page, perPage, totalCount, sortBy = 'name', sortOrder = 'asc' }: OfficeListProps) {
  const router = useAdminRouter();
  const searchParams = useSearchParams();
  const { hasPermission } = useSession();

  const handleSort = (field: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (sortBy === field) {
      params.set('sortOrder', sortOrder === 'desc' ? 'asc' : 'desc');
    } else {
      params.set('sortBy', field);
      params.set('sortOrder', 'asc');
    }
    params.set('page', '1');
    router.push(`/admin/offices?${params.toString()}`);
  };

  const canEdit = hasPermission(PERMISSIONS.OFFICES.EDIT);
  const canCreate = hasPermission(PERMISSIONS.OFFICES.CREATE);
  const canDelete = hasPermission(PERMISSIONS.OFFICES.DELETE);
  const canViewAudit = hasPermission(PERMISSIONS.CHANGELOGS.VIEW);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!deleteId) return;
    const result = await deleteOffice(deleteId);
    if (result.success) toast.success(result.message);
    else toast.error(result.message);
    setDeleteId(null);
  };

  const handleExportCSV = async () => {
    try {
      const offices = await getAllOfficesForExport();

      const headers = [
        'Name',
        'Address',
        'Latitude',
        'Longitude',
        'Status',
        'Note',
        'Created By',
        'Created At',
        'Last Updated By',
        'Deleted At',
      ];
      const csvContent = [
        headers.join(','),
        ...offices.map(office => {
          return [
            `"${office.name}"`,
            `"${office.address || ''}"`,
            office.latitude !== null && office.latitude !== undefined ? office.latitude.toString() : '',
            office.longitude !== null && office.longitude !== undefined ? office.longitude.toString() : '',
            office.status ? 'Active' : 'Inactive',
            `"${office.note ? office.note.replace(/"/g, '""') : ''}"`,
            `"${office.createdBy?.name || 'System'}"`,
            `"${format(new Date(office.createdAt), 'yyyy/MM/dd HH:mm')}"`,
            `"${office.lastUpdatedBy?.name || ''}"`,
            `"${office.deletedAt ? format(new Date(office.deletedAt), 'yyyy/MM/dd HH:mm') : ''}"`,
          ].join(',');
        }),
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `offices_export_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Failed to export offices:', error);
      toast.error('Failed to export offices.');
    }
  };

  return (
    <div>
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Offices</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your office locations.</p>
        </div>
        <div className="flex flex-col md:flex-row items-center gap-2 w-full md:w-auto">
          <div className="w-full md:w-64">
            <Search placeholder="Search offices..." />
          </div>
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center justify-center h-10 px-4 py-2 bg-card text-foreground text-sm font-semibold rounded-lg border border-border hover:bg-muted/50 transition-colors shadow-sm w-full md:w-auto"
          >
            <Download className="mr-2 h-4 w-4" />
            Download CSV
          </button>
          {canCreate && (
            <Link
              href="/admin/offices/create"
              className="inline-flex items-center justify-center h-10 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-sm w-full md:w-auto"
            >
              Create Office
            </Link>
          )}
          {canViewAudit && (
            <Link
              href="/admin/offices/audit"
              className="inline-flex items-center justify-center h-10 px-4 py-2 bg-card text-foreground text-sm font-semibold rounded-lg border border-border hover:bg-muted/50 transition-colors shadow-sm w-full md:w-auto"
            >
              <History className="mr-2 h-4 w-4" />
              Audit Log
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
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider w-12 text-center">#</th>
                <SortableHeader label="Name" field="name" currentSortBy={sortBy} currentSortOrder={sortOrder} onSort={handleSort} />
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Address</th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Latitude</th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Longitude
                </th>
                <SortableHeader label="Status" field="status" currentSortBy={sortBy} currentSortOrder={sortOrder} onSort={handleSort} />
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Source</th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Note</th>
                <th className="py-3 px-6 text-[10px] font-bold text-muted-foreground uppercase tracking-wider text-center">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-blue-600 dark:text-blue-400">Created By</span>
                    <span className="text-muted-foreground/60">Last Updated By</span>
                  </div>
                </th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {offices.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-muted-foreground">
                    No offices found. Offices are synced automatically from the external system.
                  </td>
                </tr>
              ) : (
                offices.map(office => (
                  <tr key={office.id} className="hover:bg-muted/30 transition-colors group">
                    <td className="py-4 px-6 text-sm text-muted-foreground text-center">{offices.indexOf(office) + 1 + (page - 1) * perPage}</td>
                    <td className="py-4 px-6 text-sm font-medium text-foreground">{office.name}</td>
                    <td className="py-4 px-6 text-sm text-muted-foreground">{office.address || 'N/A'}</td>
                    <td className="py-4 px-6 text-sm text-muted-foreground">
                      {office.latitude !== null && office.latitude !== undefined ? office.latitude.toFixed(6) : 'N/A'}
                    </td>
                    <td className="py-4 px-6 text-sm text-muted-foreground">
                      {office.longitude !== null && office.longitude !== undefined
                        ? office.longitude.toFixed(6)
                        : 'N/A'}
                    </td>
                    <td className="py-4 px-6 text-sm">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          office.status
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400'
                            : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400'
                        }`}
                      >
                        {office.status ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-sm">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted text-foreground border border-border">
                        {office.source === 'external' ? 'External' : 'Manual'}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-sm text-muted-foreground">
                      <div className="max-w-[200px] whitespace-normal wrap-break-words">{office.note || '-'}</div>
                    </td>
                    <td className="py-4 px-6 text-sm text-muted-foreground text-center">
                      <div className="flex flex-col items-center gap-1">
                        <div
                          className={`px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${
                            office.createdBy?.name
                              ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30'
                              : 'bg-muted text-foreground border border-border'
                          }`}
                          title="Created By"
                        >
                          {office.createdBy?.name || 'System'}
                        </div>
                        <div
                          className={`px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${
                            office.lastUpdatedBy?.name
                              ? 'bg-muted text-foreground border border-border'
                              : 'bg-muted text-foreground border border-border'
                          }`}
                          title="Last Updated By"
                        >
                          {office.lastUpdatedBy?.name || 'System'}
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-100">
                        <EditButton
                          href={`/admin/offices/${office.id}/edit`}
                          disabled={!canEdit}
                          title={!canEdit ? 'Permission Denied' : 'Edit'}
                        />
                        <DeleteButton
                          onClick={() => setDeleteId(office.id)}
                          disabled={!canDelete || office.source === 'external'}
                          title={
                            office.source === 'external'
                              ? 'External offices cannot be deleted'
                              : !canDelete
                                ? 'Permission Denied'
                                : 'Delete'
                          }
                        />
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
        onConfirm={handleDelete}
        title="Delete this office?"
        description="This action cannot be undone. Deletion is blocked if active employees are still assigned."
        confirmText="Delete"
        variant="danger"
      />
    </div>
  );
}
