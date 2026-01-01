'use client';

import { useTransition } from 'react';
import { Site } from '@prisma/client';
import { Serialized } from '@/lib/utils';
import { deleteSite, getAllSitesForExport } from '../actions';
import { DeleteButton } from '../../components/action-buttons';
import PaginationNav from '../../components/pagination-nav';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { Pencil, History, Download } from 'lucide-react';
import Search from '../../components/search';

type SiteWithUpdater = Site & {
  lastUpdatedBy?: { name: string } | null;
};

type SiteListProps = {
  sites: Serialized<SiteWithUpdater>[];
  page: number;
  perPage: number;
  totalCount: number;
  isSuperAdmin?: boolean;
};

export default function SiteList({ sites, page, perPage, totalCount, isSuperAdmin = false }: SiteListProps) {
  const [isPending, startTransition] = useTransition();

  const handleDelete = async (id: string) => {
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
            `"${site.lastUpdatedBy?.name || ''}"`,
            `"${site.deletedAt ? new Date(site.deletedAt).toLocaleString() : ''}"`,
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
          <h1 className="text-2xl font-bold text-gray-900">Sites</h1>
          <p className="text-sm text-gray-500 mt-1">Manage your locations and clients.</p>
        </div>
        <div className="flex flex-col md:flex-row items-center gap-2 w-full md:w-auto">
          <div className="w-full md:w-64">
            <Search placeholder="Search sites..." />
          </div>
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center justify-center h-10 px-4 py-2 bg-white text-gray-700 text-sm font-semibold rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors shadow-sm w-full md:w-auto"
          >
            <Download className="mr-2 h-4 w-4" />
            Download CSV
          </button>
          {isSuperAdmin && (
            <Link
              href="/admin/sites/audit"
              className="inline-flex items-center justify-center h-10 px-4 py-2 bg-white text-gray-700 text-sm font-semibold rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors shadow-sm w-full md:w-auto"
            >
              <History className="mr-2 h-4 w-4" />
              Audit Log
            </Link>
          )}
          <Link
            href="/admin/sites/create"
            className="inline-flex items-center justify-center h-10 px-4 py-2 bg-red-500 text-white text-sm font-semibold rounded-lg hover:bg-red-600 transition-colors shadow-sm shadow-red-500/30 w-full md:w-auto"
          >
            <span className="mr-2 text-lg leading-none">+</span>
            Create Site
          </Link>
        </div>
      </div>

      {/* Table Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="py-3 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Name</th>
                <th className="py-3 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Client Name</th>
                <th className="py-3 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Address</th>
                <th className="py-3 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Latitude</th>
                <th className="py-3 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Longitude</th>
                <th className="py-3 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="py-3 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Note</th>
                <th className="py-3 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sites.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-gray-500">
                    No sites found. Create one to get started.
                  </td>
                </tr>
              ) : (
                sites.map(site => (
                  <tr key={site.id} className="hover:bg-gray-50/50 transition-colors group">
                    <td className="py-4 px-6 text-sm font-medium text-gray-900">{site.name}</td>
                    <td className="py-4 px-6 text-sm text-gray-600 font-mono bg-gray-50/50 rounded w-fit">
                      {site.clientName || 'N/A'}
                    </td>
                    <td className="py-4 px-6 text-sm text-gray-500">{site.address || 'N/A'}</td>
                    <td className="py-4 px-6 text-sm text-gray-500">
                      {site.latitude !== null && site.latitude !== undefined ? site.latitude.toFixed(6) : 'N/A'}
                    </td>
                    <td className="py-4 px-6 text-sm text-gray-500">
                      {site.longitude !== null && site.longitude !== undefined ? site.longitude.toFixed(6) : 'N/A'}
                    </td>
                    <td className="py-4 px-6 text-sm">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          site.status ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {site.status ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-sm text-gray-500">
                      <div className="max-w-[200px] whitespace-normal wrap-break-words">{site.note || '-'}</div>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-100">
                        <Link
                          href={`/admin/sites/${site.id}/edit`}
                          className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                          <span className="sr-only">Edit</span>
                        </Link>
                        <DeleteButton
                          onClick={() => handleDelete(site.id)}
                          disabled={!isSuperAdmin || isPending}
                          title={!isSuperAdmin ? 'Only Super Admins can delete' : 'Delete'}
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
