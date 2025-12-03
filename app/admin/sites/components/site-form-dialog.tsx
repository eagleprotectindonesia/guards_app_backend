'use client';

import { useState, useEffect, useActionState } from 'react';
import { createSite, updateSite, ActionState } from '../actions';

type Site = {
  id: string;
  name: string;
  timeZone: string;
};

type Props = {
  site?: Site; // If provided, it's an edit form
  isOpen: boolean;
  onClose: () => void;
};

export default function SiteFormDialog({ site, isOpen, onClose }: Props) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    site ? updateSite.bind(null, site.id) : createSite,
    { success: false }
  );

  // Reset form when opening/closing or switching sites is handled by key-change in parent or manual effect
  // For now, simple effect to close on success
  useEffect(() => {
    if (state.success) {
      onClose();
      // We might want to reset state, but managing that with useActionState is tricky without remounting.
      // Ideally the parent unmounts this dialog or we force reset.
    }
  }, [state.success, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animation-fade-in">
        <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex justify-between items-center">
          <h2 className="text-lg font-bold text-gray-900">
            {site ? 'Edit Site' : 'Create New Site'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            ✕
          </button>
        </div>

        <form action={formAction} className="p-6 space-y-4">
          {/* Name Field */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Site Name
            </label>
            <input
              type="text"
              name="name"
              id="name"
              defaultValue={site?.name || ''}
              className="w-full h-10 px-3 rounded-lg border border-gray-200 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
              placeholder="e.g. Warehouse A"
            />
            {state.errors?.name && (
              <p className="text-red-500 text-xs mt-1">{state.errors.name[0]}</p>
            )}
          </div>

          {/* TimeZone Field */}
          <div>
            <label htmlFor="timeZone" className="block text-sm font-medium text-gray-700 mb-1">
              Time Zone
            </label>
            <select
              name="timeZone"
              id="timeZone"
              defaultValue={site?.timeZone || 'UTC'}
              className="w-full h-10 px-3 rounded-lg border border-gray-200 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all bg-white"
            >
              <option value="UTC">UTC</option>
              <option value="America/New_York">America/New_York</option>
              <option value="America/Los_Angeles">America/Los_Angeles</option>
              <option value="Europe/London">Europe/London</option>
              <option value="Asia/Tokyo">Asia/Tokyo</option>
              {/* Add more as needed, or use a full list */}
            </select>
            {state.errors?.timeZone && (
              <p className="text-red-500 text-xs mt-1">{state.errors.timeZone[0]}</p>
            )}
          </div>

          {/* Error Message */}
          {state.message && !state.success && (
            <div className="p-3 rounded bg-red-50 text-red-600 text-sm">{state.message}</div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 font-semibold text-sm hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-2 rounded-lg bg-red-500 text-white font-semibold text-sm hover:bg-red-600 active:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-red-500/30"
            >
              {isPending ? 'Saving...' : site ? 'Save Changes' : 'Create Site'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
