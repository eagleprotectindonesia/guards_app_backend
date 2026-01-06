'use client';

import { useState } from 'react';
import Modal from '../../components/modal';
import { Trash2, XCircle, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';

type ShiftActionModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onDelete: () => void;
  onCancelShift: (note?: string) => void;
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
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [cancelNote, setCancelNote] = useState('');
  const canCancel = status === 'in_progress';
  const canDelete = isSuperAdmin || status === 'scheduled';

  const handleConfirm = () => {
    if (selectedAction === 'cancel') {
      onCancelShift(cancelNote);
    } else if (selectedAction === 'delete') {
      onDelete();
    }
  };

  const handleClose = () => {
    setSelectedAction(null);
    setCancelNote('');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Shift Actions">
      <div className="p-6">
        <p className="text-sm text-gray-600 mb-6">Choose an action to perform on this shift.</p>

        <div className="space-y-6">
          <RadioGroup value={selectedAction || ''} onValueChange={setSelectedAction} className="gap-4">
            {canCancel && (
              <div
                className={`flex items-start gap-3 p-4 rounded-lg border transition-all cursor-pointer ${
                  selectedAction === 'cancel' ? 'border-red-200 bg-red-50' : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => setSelectedAction('cancel')}
              >
                <RadioGroupItem value="cancel" id="cancel" className="mt-1" />
                <Label htmlFor="cancel" className="flex flex-col gap-1 cursor-pointer flex-1">
                  <span className="font-semibold text-gray-900 flex items-center gap-2">
                    <XCircle className="w-4 h-4 text-red-500" />
                    Cancel Shift
                  </span>
                  <span className="text-xs text-gray-500 font-normal">
                    Mark as cancelled but keep for audit records.
                  </span>
                </Label>
              </div>
            )}

            {canDelete && (
              <div
                className={`flex items-start gap-3 p-4 rounded-lg border transition-all cursor-pointer ${
                  selectedAction === 'delete' ? 'border-red-200 bg-red-50' : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => setSelectedAction('delete')}
              >
                <RadioGroupItem value="delete" id="delete" className="mt-1" />
                <Label htmlFor="delete" className="flex flex-col gap-1 cursor-pointer flex-1">
                  <span className="font-semibold text-gray-900 flex items-center gap-2">
                    <Trash2 className="w-4 h-4 text-red-600" />
                    Delete Permanently
                  </span>
                  <span className="text-xs text-gray-500 font-normal">
                    Completely remove this shift record. This cannot be undone.
                  </span>
                </Label>
              </div>
            )}
          </RadioGroup>

          {!canCancel && !canDelete && (
            <div className="p-4 bg-yellow-50 border border-yellow-100 rounded-lg flex gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-600 shrink-0" />
              <p className="text-sm text-yellow-700">
                Only in-progress shifts can be cancelled. Since you are not a Super Admin, you can only delete scheduled shifts.
              </p>
            </div>
          )}

          {selectedAction === 'cancel' && (
            <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
              <label htmlFor="cancelNote" className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Cancellation Note (Optional)
              </label>
              <textarea
                id="cancelNote"
                rows={3}
                className="w-full px-3 py-2 text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none transition-all resize-none"
                placeholder="Enter reason for cancellation..."
                value={cancelNote}
                onChange={e => setCancelNote(e.target.value)}
                disabled={isPending}
              />
            </div>
          )}

          <div className="flex flex-col gap-3 pt-2">
            <Button
              onClick={handleConfirm}
              disabled={!selectedAction || isPending}
              variant={selectedAction === 'delete' ? 'destructive' : 'default'}
              className="w-full h-11"
            >
              {isPending ? 'Processing...' : 'Confirm Action'}
            </Button>

            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-gray-500 text-sm hover:text-gray-700 transition-colors w-full"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
