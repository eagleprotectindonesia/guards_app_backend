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
        <div className="bg-muted/50 p-4 rounded-lg overflow-auto max-h-[60vh] border border-border">
          <pre className="text-sm font-mono text-foreground whitespace-pre-wrap">
            {details ? JSON.stringify(details, null, 2) : 'No details available.'}
          </pre>
        </div>
        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-muted text-foreground font-medium rounded-lg hover:bg-muted/80 transition-colors border border-border"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
