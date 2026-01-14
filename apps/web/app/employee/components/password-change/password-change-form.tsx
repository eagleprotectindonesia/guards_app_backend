'use client';

import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { UseMutationResult } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

interface ChangePasswordError {
  message?: string;
  errors?: Array<{ field: string; message: string }>;
}

type PasswordChangeFormProps = {
  onClose: () => void;
  isOpen: boolean;
  mutation: UseMutationResult<unknown, ChangePasswordError, Record<string, string>>;
};

export function PasswordChangeForm({
  onClose,
  isOpen,
  mutation
}: PasswordChangeFormProps) {
  const { t } = useTranslation();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  if (!isOpen) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await mutation.mutateAsync({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      // onSuccess can be handled here or in the caller
    } catch {
      // Errors are available in mutation.error
    }
  };

  const errorData = mutation.error;

  return (
    <div className="mt-4 p-4 border rounded bg-gray-50 relative">
      <button
        onClick={onClose}
        className="absolute top-2 right-2 text-gray-500 hover:text-gray-700"
        aria-label={t('common.cancel')}
      >
        &times;
      </button>
      <h2 className="text-xl font-semibold mb-4">{t('passwordChange.title')}</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700">
            {t('passwordChange.currentPasswordLabel')}
          </label>
          <input
            type="password"
            id="currentPassword"
            name="currentPassword"
            placeholder={t('passwordChange.currentPasswordPlaceholder')}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          />
        </div>
        <div>
          <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700">
            {t('passwordChange.newPasswordLabel')}
          </label>
          <input
            type="password"
            id="newPassword"
            name="newPassword"
            placeholder={t('passwordChange.newPasswordPlaceholder')}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          />
          {errorData?.errors?.find((e) => e.field === 'newPassword') && (
            <p className="text-red-500 text-xs mt-1">
              {errorData.errors.find((e) => e.field === 'newPassword')?.message}
            </p>
          )}
        </div>
        <Button type="submit" className="w-full" disabled={mutation.isPending}>
          {mutation.isPending ? t('common.processing') : t('passwordChange.submitButton')}
        </Button>
        {mutation.isSuccess && (
          <p className="mt-4 text-center text-sm text-green-600">
            {t('passwordChange.successMessage')}
          </p>
        )}
        {mutation.isError && errorData?.message && (
          <p className="mt-4 text-center text-sm text-red-600">
            {errorData.message}
          </p>
        )}
      </form>
    </div>
  );
}
