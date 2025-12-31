'use client';

import Modal from '../../components/modal';
import { Trash2, XCircle } from 'lucide-react';

type ShiftActionModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onDelete: () => void;
  onCancelShift: () => void;
  isPending?: boolean;
  isSuperAdmin?: boolean;
  status?: string;
};

export default function ShiftActionModal({
  isOpen,
  onClose,
  onDelete,
  onCancelShift,
  isPending = false,
  isSuperAdmin = false,
  status,
}: ShiftActionModalProps) {
  const canCancel = status === 'in_progress';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Shift Actions">
      <div className="p-6">
        <p className="text-sm text-gray-600 mb-6">
          {isSuperAdmin 
            ? "What would you like to do with this shift? You can either cancel it (keep record) or delete it permanently."
            : "Would you like to cancel this shift? This will mark the shift as cancelled while keeping a record of it for audit purposes."
          }
        </p>

        <div className="flex flex-col gap-3">
          {canCancel && (
            <button
              type="button"
              onClick={onCancelShift}
              disabled={isPending}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-gray-200 text-gray-700 font-semibold text-sm hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <XCircle className="w-4 h-4 text-slate-500" />
              Cancel Shift (Change Status)
            </button>
          )}
          
          {isSuperAdmin && (
            <button
              type="button"
              onClick={onDelete}
              disabled={isPending}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-red-50 text-red-700 font-semibold text-sm hover:bg-red-100 transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4 text-red-600" />
              Delete Shift Permanently
            </button>
          )}

          {!canCancel && !isSuperAdmin && (
            <div className="p-4 bg-yellow-50 text-yellow-700 rounded-lg text-sm mb-2">
              Only in-progress shifts can be cancelled.
            </div>
          )}

          <button
            type="button"
            onClick={onClose}
            className="mt-2 px-4 py-2 text-gray-500 text-sm hover:text-gray-700 transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    </Modal>
  );
}
