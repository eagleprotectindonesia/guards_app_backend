'use client';

import { useState, useEffect, useActionState } from 'react';
import { Button } from '@/components/ui/button';
import Modal from '../components/modal';
import { changePassword, ChangePasswordState } from './actions';

interface ProfileClientProps {
  admin: {
    name: string;
    email: string;
  };
}

const initialState: ChangePasswordState = {};

export default function ProfileClient({ admin }: ProfileClientProps) {
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(changePassword, initialState);

  // Reset state when modal opens
  useEffect(() => {
    if (isPasswordModalOpen) {
      // We can't easily reset the action state without a wrapper or key change,
      // but we can manage the UI message visibility.
    }
  }, [isPasswordModalOpen]);

  // Close modal on success
  useEffect(() => {
    if (state.message) {
      // Optional: Close modal automatically?
      // setIsPasswordModalOpen(false);
    }
  }, [state.message]);

  const closeModal = () => {
    setIsPasswordModalOpen(false);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Profile</h1>
        <p className="text-gray-500">Manage your account settings.</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-200 bg-gray-50">
          <h2 className="text-lg font-semibold text-gray-900">Personal Information</h2>
        </div>
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-500">Full Name</label>
              <div className="mt-1 text-base font-medium text-gray-900">{admin.name}</div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500">Email Address</label>
              <div className="mt-1 text-base font-medium text-gray-900">{admin.email}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-200 bg-gray-50">
          <h2 className="text-lg font-semibold text-gray-900">Security</h2>
        </div>
        <div className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-medium text-gray-900">Password</h3>
              <p className="text-sm text-gray-500">Update your password to keep your account secure.</p>
            </div>
            <Button
              variant="outline"
              onClick={() => setIsPasswordModalOpen(true)}
              className="border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Change Password
            </Button>
          </div>
        </div>
      </div>

      <Modal isOpen={isPasswordModalOpen} onClose={closeModal} title="Change Password">
        <form action={formAction} className="space-y-4 py-4">
          {state?.message && (
            <div className="p-4 rounded-lg text-sm bg-green-50 text-green-700 border border-green-200">
              {state.message}
            </div>
          )}

          {state?.error && (
            <div className="p-4 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200">{state.error}</div>
          )}

          <div className="space-y-2">
            <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700">
              Current Password
            </label>
            <input
              id="currentPassword"
              name="currentPassword"
              type="password"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700">
              New Password
            </label>
            <input
              id="newPassword"
              name="newPassword"
              type="password"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
              Confirm New Password
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={closeModal}
              className="border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending} className="bg-red-600 hover:bg-red-700 text-white">
              {isPending ? 'Updating...' : 'Update Password'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
