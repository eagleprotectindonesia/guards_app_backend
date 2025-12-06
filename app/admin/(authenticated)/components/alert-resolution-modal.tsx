'use client';

import { useState, useEffect } from 'react';
import Modal from './modal';

interface AlertResolutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (outcome: 'resolve' | 'forgive', note: string) => Promise<void>;
}

export default function AlertResolutionModal({ isOpen, onClose, onConfirm }: AlertResolutionModalProps) {
  const [outcome, setOutcome] = useState<'resolve' | 'forgive'>('resolve');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setOutcome('resolve');
      setNote('');
      setIsSubmitting(false);
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    if (!note.trim()) return;
    setIsSubmitting(true);
    try {
      await onConfirm(outcome, note);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Resolve Alert">
      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">Resolution Outcome</label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setOutcome('resolve')}
              className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${
                outcome === 'resolve'
                  ? 'border-blue-600 bg-blue-50 text-blue-700'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <span className="font-semibold mb-1">Standard Resolve</span>
              <span className="text-xs text-center opacity-80">
                Mark as resolved but keep &quot;Missed&quot; count.
              </span>
            </button>

            <button
              type="button"
              onClick={() => setOutcome('forgive')}
              className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${
                outcome === 'forgive'
                  ? 'border-green-600 bg-green-50 text-green-700'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <span className="font-semibold mb-1">Forgive</span>
              <span className="text-xs text-center opacity-80">
                Mark as resolved and remove &quot;Missed&quot; count.
              </span>
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="resolution-note" className="block text-sm font-medium text-gray-700 mb-1">
            Resolution Note <span className="text-red-500">*</span>
          </label>
          <textarea
            id="resolution-note"
            rows={3}
            className="w-full rounded-lg border border-gray-300 p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow"
            placeholder="Explain why this alert is being resolved..."
            value={note}
            onChange={e => setNote(e.target.value)}
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!note.trim() || isSubmitting}
            className={`px-6 py-2 text-sm font-medium text-white rounded-lg transition-all shadow-sm ${
              outcome === 'resolve'
                ? 'bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400'
                : 'bg-green-600 hover:bg-green-700 disabled:bg-green-400'
            }`}
          >
            {isSubmitting ? 'Saving...' : 'Confirm Resolution'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
