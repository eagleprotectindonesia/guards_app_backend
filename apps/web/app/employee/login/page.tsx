'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { PasswordInput } from '@/components/ui/password-input';
import { useLogin } from '../(authenticated)/hooks/use-employee-queries';
import { useTranslation } from 'react-i18next';
import { GlassLanguageToggle } from '@/components/glass-language-toggle';
import { User, Lock, LogIn, AlertCircle } from 'lucide-react';
import Image from 'next/image';

export default function GuardLoginPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const loginMutation = useLogin();
  const [employeeNumber, setEmployeeNumber] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Clear error when user modifies inputs
  // useEffect(() => {
  //   if (error) setError(null);
  // }, [employeeNumber, password]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!employeeNumber || !password) {
      setError(t('login.validationErrorMessage'));
      return;
    }

    try {
      await loginMutation.mutateAsync({ employeeNumber, password });
      router.push('/employee');
    } catch (err: unknown) {
      setError(t('login.errorMessage'));
    }
  };

  return (
    <div className="relative min-h-screen w-full flex flex-col items-center justify-center p-6 bg-[#050505] overflow-hidden text-white font-sans selection:bg-red-500/30">
      {/* Background Effects */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Radial Glow 1 */}
        <div className="absolute top-[10%] left-[20%] w-[60vw] h-[60vw] bg-[#E6392D] rounded-full opacity-[0.08] blur-[100px] transform scale-[2]" />
        {/* Radial Glow 2 */}
        <div className="absolute bottom-[10%] right-[10%] w-[40vw] h-[40vw] bg-[#E6392D] rounded-full opacity-[0.05] blur-[80px] transform scale-[1.5]" />
      </div>

      <div className="relative z-10 w-full max-w-md flex flex-col items-center">
        {/* Language Toggle */}
        <div className="absolute -top-12 right-0 md:-top-16">
          <GlassLanguageToggle />
        </div>

        {/* Logo & Header */}
        <div className="flex flex-col items-center gap-6 mb-12 animate-in fade-in slide-in-from-top-4 duration-1000">
          <div className="relative group">
            <div className="absolute inset-0 bg-[#E6392D] opacity-20 group-hover:opacity-30 rounded-full blur-[35px] transition-opacity duration-500" />
            <div className="relative w-24 h-24 md:w-32 md:h-32 flex items-center justify-center">
              <Image
                src="/icons/logo-shield.svg"
                alt="Logo"
                width={128}
                height={128}
                className="w-20 h-20 md:w-28 md:h-28 drop-shadow-[0_0_15px_rgba(230,57,45,0.5)] transition-transform duration-500 group-hover:scale-105"
              />
            </div>
          </div>

          <div className="text-center">
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-white mb-2">
              Eagle
              <span className="text-[#E6392D] drop-shadow-[0_0_15px_rgba(230,57,45,0.7)] uppercase ml-1">Protect</span>
            </h1>
            <p className="text-sm md:text-base font-bold tracking-[0.2em] text-gray-500 uppercase">EMPLOYEE PORTAL</p>
          </div>
        </div>

        {/* Login Card */}
        <div className="w-full backdrop-blur-xl bg-black/80 border border-red-500/20 rounded-[2rem] overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-700">
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />

          <form onSubmit={handleSubmit} className="relative p-8 md:p-10 space-y-8">
            {/* Employee ID */}
            <div className="space-y-3">
              <label
                htmlFor="employeeNumber"
                className="block text-sm font-bold tracking-[0.1em] text-gray-400 ml-1 uppercase"
              >
                {t('login.employeeIdLabel')}
              </label>
              <div className="relative group/input">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 transition-colors group-focus-within/input:text-[#E6392D]">
                  <User size={20} />
                </div>
                <input
                  type="text"
                  id="employeeNumber"
                  name="employeeNumber"
                  placeholder={t('login.employeeIdPlaceholder')}
                  value={employeeNumber}
                  required
                  autoCapitalize="characters"
                  className="w-full bg-[#0F0F11]/80 pl-12 pr-4 py-4 rounded-2xl border border-white/5 focus:border-red-500/50 focus:bg-[#0F0F11] outline-none transition-all placeholder:text-gray-700 text-white font-medium"
                  onChange={e => {
                    setEmployeeNumber(e.target.value.toUpperCase());
                  }}
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-3">
              <label
                htmlFor="password"
                className="block text-sm font-bold tracking-[0.1em] text-gray-400 ml-1 uppercase"
              >
                {t('login.passwordLabel')}
              </label>
              <div className="relative group/input">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 transition-colors group-focus-within/input:text-[#E6392D]">
                  <Lock size={20} />
                </div>
                <PasswordInput
                  id="password"
                  name="password"
                  placeholder={t('login.passwordPlaceholder')}
                  value={password}
                  required
                  className="w-full bg-[#0F0F11]/80 pl-12 pr-12 py-4 rounded-2xl border border-white/5 focus:border-red-500/50 focus:bg-[#0F0F11] outline-none transition-all placeholder:text-gray-700 text-white font-medium"
                  onChange={e => setPassword(e.target.value)}
                />
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-4">
              <button
                type="submit"
                disabled={loginMutation.isPending}
                className="relative w-full group overflow-hidden rounded-2xl p-[1px] focus:outline-none transition-transform active:scale-[0.98] disabled:opacity-50"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-red-600 to-red-900 transition-all group-hover:blur-md" />
                <div className="relative flex items-center justify-center gap-3 bg-gradient-to-r from-red-600 to-[#8B0000] py-4 rounded-2xl transition-all group-hover:from-red-500 group-hover:to-red-800">
                  {loginMutation.isPending ? (
                    <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <span className="text-sm font-black tracking-widest uppercase italic">
                        {t('login.submitButton')}
                      </span>
                      <LogIn size={20} />
                    </>
                  )}
                </div>
              </button>
            </div>

            {/* Error Message */}
            {error && (
              <div className="flex items-center justify-center gap-2 text-red-500 font-bold text-sm animate-in fade-in slide-in-from-bottom-2 duration-300">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
