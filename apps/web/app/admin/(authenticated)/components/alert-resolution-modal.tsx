'use client';

import { useState, useEffect } from 'react';
import Modal from './modal';

interface AlertResolutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (outcome: 'resolve' | 'forgive', note: string) => Promise<void>;
  alertType?: string;
}

export default function AlertResolutionModal({ isOpen, onClose, onConfirm, alertType }: AlertResolutionModalProps) {
  const [outcome, setOutcome] = useState<'resolve' | 'forgive'>('resolve');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setOutcome(alertType === 'missed_attendance' ? 'forgive' : 'resolve');
      setNote('');
      setIsSubmitting(false);
    }
  }, [isOpen, alertType]);

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
      <div className="space-y-6 p-6">
        <div>
          <label className="block text-sm font-medium text-foreground mb-3">Resolution Outcome</label>
          <div className={`grid ${alertType === 'missed_attendance' ? 'grid-cols-1' : 'grid-cols-2'} gap-3`}>
            {alertType !== 'missed_attendance' && (
              <button
                type="button"
                onClick={() => setOutcome('resolve')}
                className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${
                  outcome === 'resolve'
                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'border-border bg-card text-muted-foreground hover:border-muted hover:bg-muted/50'
                }`}
              >
                <span className="font-semibold mb-1">Reject</span>
                <span className="text-xs text-center opacity-80">
                  {alertType === 'missed_attendance'
                    ? 'Record attendance as absent'
                    : 'Mark as resolved but keep "Missed" count.'}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setOutcome('forgive')}
              className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${
                outcome === 'forgive'
                  ? 'border-green-600 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                  : 'border-border bg-card text-muted-foreground hover:border-muted hover:bg-muted/50'
              }`}
            >
              <span className="font-semibold mb-1">Forgive</span>
              <span className="text-xs text-center opacity-80">
                {alertType === 'missed_attendance'
                  ? 'Record attendance as late'
                  : 'Mark as resolved and remove "Missed" count.'}
              </span>
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="resolution-note" senior-id="resolution-note" className="block text-sm font-medium text-foreground mb-1">
            Resolution Note <span className="text-red-500">*</span>
          </label>
          <textarea
            id="resolution-note"
            rows={3}
            className="w-full rounded-lg border border-border bg-card p-3 text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-shadow text-foreground placeholder:text-muted-foreground/50"
            placeholder="Explain why this alert is being resolved..."
            value={note}
            onChange={e => setNote(e.target.value)}
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-foreground bg-muted hover:bg-muted/80 rounded-lg transition-colors border border-border"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!note.trim() || isSubmitting}
            className={`px-6 py-2 text-sm font-bold text-white rounded-lg transition-all shadow-sm ${
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
