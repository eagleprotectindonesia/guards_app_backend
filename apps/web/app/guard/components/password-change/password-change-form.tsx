'use client';

import { Button } from '@/components/ui/button';

// Type for password change form state
type PasswordChangeState = {
  success?: boolean;
  message?: string;
  errors?: { field: string; message: string }[];
};

type PasswordChangeFormProps = {
  onClose: () => void;
  isOpen: boolean;
  actionState: PasswordChangeState;
  formAction: (formData: FormData) => void;
};

export function PasswordChangeForm({
  onClose,
  isOpen,
  actionState,
  formAction
}: PasswordChangeFormProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="mt-4 p-4 border rounded bg-gray-50 relative">
      <button
        onClick={onClose}
        className="absolute top-2 right-2 text-gray-500 hover:text-gray-700"
        aria-label="Tutup"
      >
        &times;
      </button>
      <h2 className="text-xl font-semibold mb-4">Ubah Kata Sandi</h2>
      <form action={formAction} className="space-y-4">
        <div>
          <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700">
            Kata Sandi Saat Ini
          </label>
          <input
            type="password"
            id="currentPassword"
            name="currentPassword"
            required
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          />
        </div>
        <div>
          <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700">
            Kata Sandi Baru
          </label>
          <input
            type="password"
            id="newPassword"
            name="newPassword"
            required
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          />
          {actionState.errors?.find(e => e.field === 'newPassword') && (
            <p className="text-red-500 text-xs mt-1">
              {actionState.errors.find(e => e.field === 'newPassword')?.message ===
              'Must be at least 8 characters'
                ? 'Harus minimal 8 karakter'
                : actionState.errors.find(e => e.field === 'newPassword')?.message}
            </p>
          )}
        </div>
        <Button type="submit" className="w-full">
          Perbarui Kata Sandi
        </Button>
        {actionState.message && (
          <p
            className={`mt-4 text-center text-sm ${
              actionState.success ? 'text-green-600' : 'text-red-600'
            }`}
          >
            {actionState.message}
          </p>
        )}
      </form>
    </div>
  );
}