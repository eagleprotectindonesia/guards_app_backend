'use client';

import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { UseMutationResult } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { PasswordInput } from '@/components/ui/password-input';
import { Lock, ShieldCheck, RefreshCcw, Radio } from 'lucide-react';

interface ChangePasswordError {
  message?: string;
  errors?: Array<{ field: string; message: string }>;
}

type PasswordChangeFormProps = {
  onClose: () => void;
  isOpen: boolean;
  mutation: UseMutationResult<unknown, ChangePasswordError, Record<string, string>>;
};

export function PasswordChangeForm({ onClose, isOpen, mutation }: PasswordChangeFormProps) {
  const { t } = useTranslation();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    // Client-side validation
    if (newPassword !== confirmPassword) {
      setValidationError(t('passwordChange.passwordsDoNotMatch'));
      return;
    }

    if (newPassword.length < 8) {
      setValidationError(t('passwordChange.newPasswordMinLength'));
      return;
    }

    try {
      await mutation.mutateAsync({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      onClose();
    } catch {
      // Errors are handled by the mutation state
    }
  };

  const errorData = mutation.error;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-[#121212]/95 border-[#ec5b13]/30 text-white backdrop-blur-xl shadow-[0_0_40px_-10px_rgba(236,91,19,0.3)] p-0 overflow-hidden max-w-md w-full gap-0">
        {/* Neon decorative background */}
        <div className="absolute inset-0 pointer-events-none z-0">
          <div className="absolute top-[-50%] left-[-50%] w-[200%] h-[200%] bg-[radial-gradient(circle_at_center,rgba(236,91,19,0.08)_0%,transparent_50%)]" />
        </div>

        <DialogHeader className="p-6 relative z-10 border-b border-white/5">
          <div className="flex justify-between items-start">
            <div>
              <DialogTitle className="text-xl font-bold text-white">{t('passwordChange.title')}</DialogTitle>
              <DialogDescription className="text-neutral-400 mt-1">
                {t('passwordChange.description') || 'Ensure your account stays secure with a strong password.'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 relative z-10">
          {/* Current Password */}
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest font-bold text-neutral-500 pl-1">
              {t('passwordChange.currentPasswordLabel')}
            </label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-500 group-focus-within:text-[#ec5b13] transition-colors z-10">
                <Lock size={18} />
              </div>
              <PasswordInput
                id="currentPassword"
                name="currentPassword"
                placeholder="••••••••"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                required
                className="pl-10 h-12 bg-black/20 border-white/10 text-white placeholder:text-white/20 focus:border-[#ec5b13] focus:ring-[#ec5b13]/20 rounded-xl"
                wrapperClassName="w-full"
              />
            </div>
          </div>

          {/* New Password */}
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest font-bold text-neutral-500 pl-1">
              {t('passwordChange.newPasswordLabel')}
            </label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-500 group-focus-within:text-[#ec5b13] transition-colors z-10">
                <Lock size={18} />
              </div>
              <PasswordInput
                id="newPassword"
                name="newPassword"
                placeholder="••••••••"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                required
                className="pl-10 h-12 bg-black/20 border-white/10 text-white placeholder:text-white/20 focus:border-[#ec5b13] focus:ring-[#ec5b13]/20 rounded-xl"
                wrapperClassName="w-full"
              />
            </div>
          </div>

          {/* Confirm Password */}
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest font-bold text-neutral-500 pl-1">
              {t('passwordChange.confirmPasswordLabel') || 'Confirm New Password'}
            </label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-500 group-focus-within:text-[#ec5b13] transition-colors z-10">
                <Lock size={18} />
              </div>
              <PasswordInput
                id="confirmPassword"
                name="confirmPassword"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
                className="pl-10 h-12 bg-black/20 border-white/10 text-white placeholder:text-white/20 focus:border-[#ec5b13] focus:ring-[#ec5b13]/20 rounded-xl"
                wrapperClassName="w-full"
              />
            </div>
            {validationError && (
              <p className="text-red-500 text-xs mt-1 pl-1 flex items-center gap-1">
                <Radio size={12} /> {validationError}
              </p>
            )}
            {errorData?.errors?.find(e => e.field === 'newPassword') && (
              <p className="text-red-500 text-xs mt-1 pl-1 flex items-center gap-1">
                <Radio size={12} /> {errorData.errors.find(e => e.field === 'newPassword')?.message}
              </p>
            )}
            {mutation.isError && errorData?.message && !errorData?.errors && (
              <p className="text-red-500 text-xs mt-1 pl-1 flex items-center gap-1">
                <Radio size={12} /> {errorData.message}
              </p>
            )}
          </div>

          <div className="pt-4">
            <Button
              type="submit"
              disabled={mutation.isPending}
              className="w-full h-12 bg-[#ec5b13] hover:bg-[#d94a00] text-white font-bold rounded-xl shadow-[0_4px_14px_0_rgba(236,91,19,0.39)] transition-all active:scale-[0.98]"
            >
              {mutation.isPending ? (
                <span className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {t('common.processing')}
                </span>
              ) : (
                <span className="flex items-center gap-2 justify-center">
                  <RefreshCcw size={18} />
                  {t('passwordChange.submitButton')}
                </span>
              )}
            </Button>

            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={mutation.isPending}
              className="w-full mt-3 h-12 text-neutral-400 hover:text-white hover:bg-white/5 font-medium rounded-xl"
            >
              {t('common.cancel')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
