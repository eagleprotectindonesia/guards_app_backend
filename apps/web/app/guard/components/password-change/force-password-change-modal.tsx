'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useChangePassword } from '../../(authenticated)/hooks/use-guard-queries';
import { useTranslation } from 'react-i18next';

interface ChangePasswordError {
  message?: string;
  errors?: Array<{ field: string; message: string }>;
}

export function ForcePasswordChangeModal({ mustChange }: { mustChange: boolean }) {
  const { t } = useTranslation();
  const changePasswordMutation = useChangePassword();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await changePasswordMutation.mutateAsync({ currentPassword, newPassword });
    } catch {
      // Error handled via mutation state
    }
  };

  useEffect(() => {
    if (changePasswordMutation.isSuccess) {
      window.location.reload();
    }
  }, [changePasswordMutation.isSuccess]);

  const errorData = changePasswordMutation.error as ChangePasswordError | null;

  return (
    <Dialog open={mustChange && !changePasswordMutation.isSuccess}>
      <DialogContent showCloseButton={false} onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{t('passwordChange.title')}</DialogTitle>
          <DialogDescription>
            {t('passwordChange.forceChangeMessage')}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="force-currentPassword" className="block text-sm font-medium text-gray-700">
              {t('passwordChange.currentPasswordLabel')}
            </label>
            <input
              type="password"
              id="force-currentPassword"
              name="currentPassword"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            />
            {errorData?.errors?.find((e) => e.field === 'currentPassword') && (
              <p className="text-red-500 text-xs mt-1">
                {errorData.errors.find((e) => e.field === 'currentPassword')?.message}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="force-newPassword" className="block text-sm font-medium text-gray-700">
              {t('passwordChange.newPasswordLabel')}
            </label>
            <input
              type="password"
              id="force-newPassword"
              name="newPassword"
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
          <Button type="submit" className="w-full" disabled={changePasswordMutation.isPending}>
            {changePasswordMutation.isPending ? t('common.processing') : t('passwordChange.submitButton')}
          </Button>
          {changePasswordMutation.isError && errorData?.message && (
            <p className="mt-4 text-center text-sm text-red-600">
              {errorData.message}
            </p>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}