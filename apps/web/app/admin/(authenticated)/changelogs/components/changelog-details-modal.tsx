'use client';

import { JsonValue } from '@prisma/client/runtime/client';
import Modal from '../../components/modal';

type ChangelogDetailsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  details: JsonValue | null;
};

export default function ChangelogDetailsModal({ isOpen, onClose, details }: ChangelogDetailsModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Change Details">
      <div className="p-6">
        <div className="bg-gray-50 p-4 rounded-lg overflow-auto max-h-[60vh] border border-gray-200">
          <pre className="text-sm font-mono text-gray-800 whitespace-pre-wrap">
            {details ? JSON.stringify(details, null, 2) : 'No details available.'}
          </pre>
        </div>
        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
