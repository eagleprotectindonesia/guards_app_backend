'use client';

import Modal from '../../components/modal';
import { createSite, updateSite, ActionState } from '../actions';
import { useActionState, useEffect } from 'react';
import toast from 'react-hot-toast';

type Site = {
  id: string;
  name: string;
  clientName: string | null;
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

  useEffect(() => {
    if (state.success) {
      toast.success(state.message || (site ? 'Site updated successfully!' : 'Site created successfully!'));
      onClose();
    } else if (state.message && !state.success) {
      toast.error(state.message);
    }
  }, [state, onClose, site]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={site ? 'Edit Site' : 'Create New Site'}>
      <form action={formAction} className="space-y-4 p-4">
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
          {state.errors?.name && <p className="text-red-500 text-xs mt-1">{state.errors.name[0]}</p>}
        </div>

        {/* Client Name Field */}
        <div>
          <label htmlFor="clientName" className="block text-sm font-medium text-gray-700 mb-1">
            Client Name
          </label>
          <input
            type="text"
            name="clientName"
            id="clientName"
            defaultValue={site?.clientName || ''}
            className="w-full h-10 px-3 rounded-lg border border-gray-200 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
            placeholder="e.g. Acme Corp"
          />
          {state.errors?.clientName && <p className="text-red-500 text-xs mt-1">{state.errors.clientName[0]}</p>}
        </div>

        {/* Error Message */}
        {state.message && !state.success && (
          <div className="p-3 rounded bg-red-50 text-red-600 text-sm">{state.message}</div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-32">
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
    </Modal>
  );
}
