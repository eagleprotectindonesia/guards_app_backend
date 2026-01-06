'use client';

import Modal from './modal';

type ConfirmDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  isPending?: boolean;
  variant?: 'danger' | 'neutral';
};

export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = 'Delete',
  cancelText = 'Cancel',
  isPending = false,
  variant = 'danger',
}: ConfirmDialogProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="p-6">
        <p className="text-sm text-gray-600 mb-6">{description}</p>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 font-semibold text-sm hover:bg-gray-50 transition-colors"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className={`px-4 py-2 rounded-lg font-semibold text-sm text-white shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed
              ${
                variant === 'danger'
                  ? 'bg-red-500 hover:bg-red-600 active:bg-red-700 shadow-red-500/30'
                  : 'bg-blue-500 hover:bg-blue-600 active:bg-blue-700 shadow-blue-500/30'
              }`}
          >
            {isPending ? 'Processing...' : confirmText}
          </button>
        </div>
      </div>
    </Modal>
  );
}
