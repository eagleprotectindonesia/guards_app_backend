'use client';

import { useState, useTransition } from 'react';
import { deleteSite } from '../actions';
import SiteFormDialog from './site-form-dialog';

type SerializedSite = {
  id: string;
  name: string;
  timeZone: string;
  createdAt: string;
  updatedAt: string;
};

export default function SiteList({ sites }: { sites: SerializedSite[] }) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingSite, setEditingSite] = useState<SerializedSite | undefined>(undefined);
  const [isPending, startTransition] = useTransition();

  const handleDelete = async (id: string) => {
    if (
      !window.confirm('Are you sure you want to delete this site? This action cannot be undone.')
    ) {
      return;
    }

    startTransition(async () => {
      await deleteSite(id);
    });
  };

  const handleEdit = (site: SerializedSite) => {
    setEditingSite(site);
  };

  const closeDialog = () => {
    setIsCreateOpen(false);
    setEditingSite(undefined);
  };

  return (
    <div>
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sites</h1>
          <p className="text-sm text-gray-500 mt-1">Manage your locations and timezones.</p>
        </div>
        <button
          onClick={() => setIsCreateOpen(true)}
          className="inline-flex items-center justify-center h-10 px-4 py-2 bg-red-500 text-white text-sm font-semibold rounded-lg hover:bg-red-600 transition-colors shadow-sm shadow-red-500/30"
        >
          <span className="mr-2 text-lg leading-none">+</span>
          Create Site
        </button>
      </div>

      {/* Table Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="py-3 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="py-3 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">
                  Time Zone
                </th>
                <th className="py-3 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">
                  Created At
                </th>
                <th className="py-3 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sites.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-gray-500">
                    No sites found. Create one to get started.
                  </td>
                </tr>
              ) : (
                sites.map(site => (
                  <tr key={site.id} className="hover:bg-gray-50/50 transition-colors group">
                    <td className="py-4 px-6 text-sm font-medium text-gray-900">{site.name}</td>
                    <td className="py-4 px-6 text-sm text-gray-600 font-mono bg-gray-50/50 rounded px-2 py-1 w-fit">
                      {site.timeZone}
                    </td>
                    <td className="py-4 px-6 text-sm text-gray-500">
                      {new Date(site.createdAt).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleEdit(site)}
                          className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                          title="Edit"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(site.id)}
                          disabled={isPending}
                          className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                          title="Delete"
                        >
                          {isPending ? '...' : 'Delete'}
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

      {/* Dialogs */}
      {/* We render the dialog if either create is open or we have an editing site */}
      <SiteFormDialog
        isOpen={isCreateOpen || !!editingSite}
        onClose={closeDialog}
        site={editingSite}
        key={editingSite ? `edit-${editingSite.id}` : 'create'}
      />
    </div>
  );
}
