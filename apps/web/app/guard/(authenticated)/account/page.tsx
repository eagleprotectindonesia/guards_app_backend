'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PasswordChangeForm } from '@/app/guard/components/password-change/password-change-form';
import { LogOut, Lock } from 'lucide-react';
import { useProfile, useLogout, useChangePassword } from '../hooks/use-guard-queries';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

export default function AccountPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { data: guardDetails } = useProfile();
  const logoutMutation = useLogout();
  const changePasswordMutation = useChangePassword();
  const [showPasswordChange, setShowPasswordChange] = useState(false);

  const handleLogout = async () => {
    if (!confirm(t('dashboard.logoutConfirmMessage'))) return;
    
    try {
      await logoutMutation.mutateAsync();
      router.push('/guard/login');
    } catch (error) {
      console.error('Network error during logout:', error);
      toast.error(t('dashboard.logoutFail', { defaultValue: 'Gagal keluar. Silakan coba lagi.' }));
    }
  };

  return (
    <div className="p-6 max-w-md mx-auto font-sans space-y-8">
      <h1 className="text-2xl font-bold">{t('account.title')}</h1>

      <div className="bg-white p-6 rounded-2xl shadow-sm flex flex-col items-center">
        <div className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center mb-4">
          <span className="text-white text-2xl font-bold">
            {guardDetails?.name?.charAt(0) || 'G'}
          </span>
        </div>
        <h2 className="text-xl font-bold">{guardDetails?.name}</h2>
        <p className="text-gray-500">{guardDetails?.guardCode}</p>
      </div>

      <div className="space-y-4">
        <p className="text-gray-500 font-bold px-1 text-sm uppercase tracking-wider">{t('account.settings')}</p>

        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <button
            onClick={() => setShowPasswordChange(true)}
            className="w-full flex items-center gap-3 px-4 py-4 text-left hover:bg-gray-50 transition-colors border-b border-gray-100"
          >
            <Lock className="h-5 w-5 text-gray-500" />
            <span className="text-gray-700 font-medium">{t('passwordChange.title')}</span>
          </button>

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-4 text-left hover:bg-gray-50 transition-colors"
          >
            <LogOut className="h-5 w-5 text-red-500" />
            <span className="text-red-500 font-medium">{t('dashboard.logout')}</span>
          </button>
        </div>
      </div>

      <PasswordChangeForm
        isOpen={showPasswordChange}
        onClose={() => setShowPasswordChange(false)}
        mutation={changePasswordMutation}
      />
    </div>
  );
}