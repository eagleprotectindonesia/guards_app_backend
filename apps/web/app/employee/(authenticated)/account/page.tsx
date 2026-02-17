'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PasswordChangeForm } from '@/app/employee/components/password-change/password-change-form';
import { LogOut, Key, ChevronRight } from 'lucide-react';
import { useProfile, useLogout, useChangePassword } from '../hooks/use-employee-queries';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import Image from 'next/image';
import { GlassLanguageToggle } from '@/components/glass-language-toggle';

const DEFAULT_AVATAR =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuDzcxM7B2Plj0M6rLwD5-jwCeXCJ-VxTGp8XT8dffCo7Cjv4BQ3_fM-MkOicyMU8jJxMw9Q81kjfqVm_zD_yfF92pmxUsZDY_fB7by9N3_LAOMNfdJlNjEUudjhqq7Cm5LUPTk9aKNVSgT9A4rsOYqHKU5vKRmjMZknp_AFtbKxzLh1PX2V_AKy5bez2tThvg_swnSuuvc4uRhd_JO8vfyGxuCUlrrS_Gt_LXaPHMHfgxPWTz6nvJqDPVw3QneYlTqVGg46xTuvrQDq';

export default function AccountPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { data: employeeDetails } = useProfile();
  const logoutMutation = useLogout();
  const changePasswordMutation = useChangePassword();
  const [showPasswordChange, setShowPasswordChange] = useState(false);

  const handleLogout = async () => {
    if (!confirm(t('dashboard.logoutConfirmMessage'))) return;

    try {
      await logoutMutation.mutateAsync();
      router.push('/employee/login');
    } catch (error) {
      console.error('Network error during logout:', error);
      toast.error(t('dashboard.logoutFail', { defaultValue: 'Gagal keluar. Silakan coba lagi.' }));
    }
  };

  return (
    <div className="flex-1 min-h-screen bg-[#121212] overflow-hidden relative flex flex-col">
      {/* Background Ambient Glow */}
      <div className="absolute top-0 right-0 w-64 h-64 opacity-20 pointer-events-none">
        <div className="w-full h-full rounded-full bg-gradient-to-b from-blue-600/30 to-transparent blur-3xl" />
      </div>
      <div className="absolute bottom-0 left-0 w-64 h-64 opacity-20 pointer-events-none">
        <div className="w-full h-full rounded-full bg-gradient-to-t from-red-600/30 to-transparent blur-3xl" />
      </div>

      {/* Top Navigation / Language Toggle */}
      <div className="px-6 pt-6 flex justify-end">
        <GlassLanguageToggle />
      </div>

      <div className="flex-1 overflow-y-auto pb-24 pt-6 px-6 space-y-8">
        {/* Header Section */}
        <div className="flex flex-col items-center space-y-6">
          <div className="relative w-32 h-32">
            <div className="w-full h-full rounded-full p-1 border border-red-500/30 bg-neutral-800/50 shadow-[0_0_20px_rgba(239,68,68,0.4)]">
              <div className="w-full h-full rounded-full overflow-hidden border-2 border-red-600 relative">
                <Image src={DEFAULT_AVATAR} alt="Profile" fill className="object-cover" />
                <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent pointer-events-none" />
              </div>
            </div>
            <div className="absolute bottom-2 right-2 w-6 h-6 bg-[#181818] rounded-full flex items-center justify-center border border-neutral-700">
              <div className="w-3 h-3 bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
            </div>
          </div>

          <div className="flex flex-col items-center">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl text-white font-bold">{employeeDetails?.firstName}</h1>
              <h1 className="text-2xl text-red-500 font-bold">{employeeDetails?.lastName}</h1>
            </div>
            <p className="text-neutral-500 text-sm font-semibold tracking-wider mt-1">
              ID: {employeeDetails?.employeeCode}
            </p>

            <div className="mt-4 px-4 py-1.5 rounded-full bg-neutral-800/50 border border-white/5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                {employeeDetails?.department?.name || 'Security Unit'} •{' '}
                {employeeDetails?.designation?.name || 'Alpha Team'}
              </p>
            </div>
          </div>
        </div>

        {/* Account Settings */}
        <div className="space-y-4">
          <p className="text-xs font-bold text-neutral-500 uppercase tracking-widest ml-2">{t('account.settings')}</p>

          <div className="bg-[#1e1e1e]/40 border border-white/10 rounded-[2rem] p-2 space-y-2 overflow-hidden backdrop-blur-md">
            {/* Change Password */}
            <button
              onClick={() => setShowPasswordChange(true)}
              className="w-full flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors active:scale-[0.98]"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                  <Key size={20} className="text-blue-500" />
                </div>
                <span className="text-sm font-semibold text-neutral-200">{t('dashboard.changePassword')}</span>
              </div>
              <ChevronRight size={16} className="text-gray-600" />
            </button>
          </div>
        </div>

        {/* Logout Section */}
        <div>
          <div className="bg-[#1e1e1e]/40 border border-white/10 rounded-[2rem] p-2 overflow-hidden backdrop-blur-md">
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-red-500/10 hover:border-red-500/20 transition-colors active:scale-[0.98] group"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center border border-red-500/20 group-hover:bg-red-500/20 transition-colors">
                  <LogOut size={20} className="text-red-500" />
                </div>
                <span className="text-sm font-bold text-red-500 tracking-wide">{t('dashboard.logout')}</span>
              </div>
            </button>
          </div>

          <p className="mt-12 text-center text-[10px] text-neutral-600 uppercase tracking-widest font-medium">
            Eagle Protect v2.4.0 (Build 892)
          </p>
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
