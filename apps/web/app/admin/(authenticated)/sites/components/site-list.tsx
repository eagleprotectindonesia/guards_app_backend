'use client';

import { useTransition } from 'react';
import { Site } from '@prisma/client';
import { Serialized } from '@/lib/utils';
import { deleteSite, getAllSitesForExport } from '../actions';
import { EditButton, DeleteButton } from '../../components/action-buttons';
import PaginationNav from '../../components/pagination-nav';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { History, Download, Pencil } from 'lucide-react';
import Search from '../../components/search';
import { format } from 'date-fns';
import { useSession } from '../../context/session-context';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { useRouter } from 'next/navigation';

type SiteWithAdminInfo = Site & {
  lastUpdatedBy?: { name: string } | null;
  createdBy?: { name: string } | null;
};

type SiteListProps = {
  sites: Serialized<SiteWithAdminInfo>[];
  page: number;
  perPage: number;
  totalCount: number;
};

export default function SiteList({ sites, page, perPage, totalCount }: SiteListProps) {
  const [isPending, startTransition] = useTransition();
  const { hasPermission } = useSession();

  const canCreate = hasPermission(PERMISSIONS.SITES.CREATE);
  const canEdit = hasPermission(PERMISSIONS.SITES.EDIT);
  const canDelete = hasPermission(PERMISSIONS.SITES.DELETE);
  const canViewAudit = hasPermission(PERMISSIONS.CHANGELOGS.VIEW);

  const handleDelete = async (id: string) => {
    if (!canDelete) return;
    if (!window.confirm('Are you sure you want to delete this site? This action cannot be undone.')) {
      return;
    }

    startTransition(async () => {
      const result = await deleteSite(id);
      if (result.success) {
        toast.success('Site deleted successfully!');
      } else {
        toast.error(result.message || 'Failed to delete site.');
      }
    });
  };

  const handleExportCSV = async () => {
    try {
      const sites = await getAllSitesForExport();

      const headers = [
        'Name',
        'Client Name',
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
        ...sites.map(site => {
          return [
            `"${site.name}"`,
            `"${site.clientName || ''}"`,
            `"${site.address || ''}"`,
            site.latitude !== null && site.latitude !== undefined ? site.latitude.toString() : '',
            site.longitude !== null && site.longitude !== undefined ? site.longitude.toString() : '',
            site.status ? 'Active' : 'Inactive',
            `"${site.note ? site.note.replace(/"/g, '""') : ''}"`,
            `"${site.createdBy?.name || ''}"`,
            `"${format(new Date(site.createdAt), 'yyyy/MM/dd HH:mm')}"`,
            `"${site.lastUpdatedBy?.name || ''}"`,
            `"${site.deletedAt ? format(new Date(site.deletedAt), 'yyyy/MM/dd HH:mm') : ''}"`,
          ].join(',');
        }),
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `sites_export_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Failed to export sites:', error);
      toast.error('Failed to export sites.');
    }
  };

  return (
    <div>
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Sites</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your locations and clients.</p>
        </div>
        <div className="flex flex-col md:flex-row items-center gap-2 w-full md:w-auto">
          <div className="w-full md:w-64">
            <Search placeholder="Search sites..." />
          </div>
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center justify-center h-10 px-4 py-2 bg-card text-foreground text-sm font-semibold rounded-lg border border-border hover:bg-muted/50 transition-colors shadow-sm w-full md:w-auto"
          >
            <Download className="mr-2 h-4 w-4" />
            Download CSV
          </button>
          {canViewAudit && (
            <Link
              href="/admin/sites/audit"
              className="inline-flex items-center justify-center h-10 px-4 py-2 bg-card text-foreground text-sm font-semibold rounded-lg border border-border hover:bg-muted/50 transition-colors shadow-sm w-full md:w-auto"
            >
              <History className="mr-2 h-4 w-4" />
              Audit Log
            </Link>
          )}
          {canCreate && (
            <Link
              href="/admin/sites/create"
              className="inline-flex items-center justify-center h-10 px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition-colors shadow-sm shadow-red-500/20 w-full md:w-auto"
            >
              <span className="mr-2 text-lg leading-none">+</span>
              Create Site
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
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Name</th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Client Name</th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Address</th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Latitude</th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Longitude</th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Status</th>
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
              {sites.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-muted-foreground">
                    No sites found. Create one to get started.
                  </td>
                </tr>
              ) : (
                sites.map(site => (
                  <tr key={site.id} className="hover:bg-muted/30 transition-colors group">
                    <td className="py-4 px-6 text-sm font-medium text-foreground">{site.name}</td>
                    <td className="py-4 px-6 text-sm text-muted-foreground font-mono bg-muted/50 rounded w-fit">
                      {site.clientName || 'N/A'}
                    </td>
                    <td className="py-4 px-6 text-sm text-muted-foreground">{site.address || 'N/A'}</td>
                    <td className="py-4 px-6 text-sm text-muted-foreground">
                      {site.latitude !== null && site.latitude !== undefined ? site.latitude.toFixed(6) : 'N/A'}
                    </td>
                    <td className="py-4 px-6 text-sm text-muted-foreground">
                      {site.longitude !== null && site.longitude !== undefined ? site.longitude.toFixed(6) : 'N/A'}
                    </td>
                    <td className="py-4 px-6 text-sm">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          site.status ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400'
                        }`}
                      >
                        {site.status ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-sm text-muted-foreground">
                      <div className="max-w-[200px] whitespace-normal wrap-break-words">{site.note || '-'}</div>
                    </td>
                    <td className="py-4 px-6 text-sm text-muted-foreground text-center">
                      <div className="flex flex-col items-center gap-1">
                        <div 
                          className={`px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${
                            site.createdBy?.name 
                              ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30' 
                              : 'text-muted-foreground/50'
                          }`} 
                          title="Created By"
                        >
                          {site.createdBy?.name || '-'}
                        </div>
                        <div 
                          className={`px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${
                            site.lastUpdatedBy?.name 
                              ? 'bg-muted text-foreground border border-border' 
                              : 'text-muted-foreground/50'
                          }`} 
                          title="Last Updated By"
                        >
                          {site.lastUpdatedBy?.name || '-'}
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-100">
                        <EditButton
                          href={`/admin/sites/${site.id}/edit`}
                          disabled={!canEdit}
                          title={!canEdit ? 'Permission Denied' : 'Edit'}
                        />
                        <DeleteButton
                          onClick={() => handleDelete(site.id)}
                          disabled={!canDelete || isPending}
                          title={!canDelete ? 'Permission Denied' : 'Delete'}
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
    </div>
  );
}
