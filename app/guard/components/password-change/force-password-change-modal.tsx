'use client';

import { useActionState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { changeGuardPasswordAction } from '@/app/guard/actions';

export function ForcePasswordChangeModal({ mustChange }: { mustChange: boolean }) {
  const [state, formAction] = useActionState(changeGuardPasswordAction, {});

  // If successfully changed, we could reload or just let the modal close if mustChange becomes false
  // But since mustChange comes from server, we might need a refresh
  useEffect(() => {
    if (state.success) {
      window.location.reload();
    }
  }, [state.success]);

  return (
    <Dialog open={mustChange && !state.success}>
      <DialogContent showCloseButton={false} onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Ganti Kata Sandi</DialogTitle>
          <DialogDescription>
            Demi keamanan, Anda diwajibkan untuk mengganti kata sandi saat pertama kali masuk.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div>
            <label htmlFor="force-currentPassword" className="block text-sm font-medium text-gray-700">
              Kata Sandi Saat Ini
            </label>
            <input
              type="password"
              id="force-currentPassword"
              name="currentPassword"
              required
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            />
            {state.errors?.find(e => e.field === 'currentPassword') && (
              <p className="text-red-500 text-xs mt-1">
                {state.errors.find(e => e.field === 'currentPassword')?.message}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="force-newPassword" className="block text-sm font-medium text-gray-700">
              Kata Sandi Baru
            </label>
            <input
              type="password"
              id="force-newPassword"
              name="newPassword"
              required
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            />
            {state.errors?.find(e => e.field === 'newPassword') && (
              <p className="text-red-500 text-xs mt-1">
                {state.errors.find(e => e.field === 'newPassword')?.message}
              </p>
            )}
          </div>
          <Button type="submit" className="w-full">
            Perbarui Kata Sandi
          </Button>
          {state.message && (
            <p
              className={`mt-4 text-center text-sm ${
                state.success ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {state.message}
            </p>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
