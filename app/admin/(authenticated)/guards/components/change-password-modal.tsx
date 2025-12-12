'use client';

import { useState, useActionState, useEffect } from 'react';
import Modal from '../../components/modal';
import { updateGuardPassword, ActionState } from '../actions';
import { PasswordInput } from '@/components/ui/password-input';
import toast from 'react-hot-toast';

type ChangePasswordModalProps = {
  isOpen: boolean;
  onClose: () => void;
  guardId: string | null;
  guardName: string;
};

export default function ChangePasswordModal({ isOpen, onClose, guardId, guardName }: ChangePasswordModalProps) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    guardId ? updateGuardPassword.bind(null, guardId) : async () => ({ success: false }),
    { success: false }
  );

  // Close modal on success
  useEffect(() => {
    if (state.success) {
      toast.success(state.message || 'Password updated successfully!');
      onClose();
    } else if (state.message && !state.success) {
        // We generally show errors inline, but toast for general failure is good too
        toast.error(state.message);
    }
  }, [state, onClose]);

  // Reset state when modal opens/closes or guard changes
  // Note: useActionState doesn't easily reset, so we rely on the component unmounting/remounting or just keying it.
  // Ideally, the parent should conditionally render this modal or we key it.

  if (!guardId) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Change Password for ${guardName}`}>
      <form action={formAction} className="p-6 space-y-6">
        <div className="space-y-4">
          <div>
            <label htmlFor="password" className="block font-medium text-gray-700 mb-1">
              New Password
            </label>
            <PasswordInput
              name="password"
              id="password"
              required
              className="w-full h-10 px-3 rounded-lg border border-gray-200 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
              placeholder="Enter new password"
            />
            {state.errors?.password && <p className="text-red-500 text-xs mt-1">{state.errors.password[0]}</p>}
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block font-medium text-gray-700 mb-1">
              Confirm New Password
            </label>
            <PasswordInput
              name="confirmPassword"
              id="confirmPassword"
              required
              className="w-full h-10 px-3 rounded-lg border border-gray-200 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
              placeholder="Confirm new password"
            />
            {state.errors?.confirmPassword && (
              <p className="text-red-500 text-xs mt-1">{state.errors.confirmPassword[0]}</p>
            )}
          </div>
        </div>

        {state.message && !state.success && (
          <div className="p-3 rounded bg-red-50 text-red-600 text-sm">{state.message}</div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 font-bold text-sm hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="px-4 py-2 rounded-lg bg-red-500 text-white font-bold text-sm hover:bg-red-600 active:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-red-500/30"
          >
            {isPending ? 'Updating...' : 'Update Password'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
