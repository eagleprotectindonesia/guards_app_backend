'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { PasswordInput } from '@/components/ui/password-input';
import { useLogin } from '../(authenticated)/hooks/use-guard-queries';
import { useTranslation } from 'react-i18next';

export default function GuardLoginPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const loginMutation = useLogin();
  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!employeeId || !password) {
      setError(t('login.validationErrorMessage'));
      return;
    }

    try {
      await loginMutation.mutateAsync({ employeeId, password });
      router.push('/guard');
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : t('login.errorMessage');
      setError(errorMessage);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100 p-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow-md p-8">
        <h1 className="text-2xl font-bold text-center mb-6">{t('login.title')}</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="employeeId" className="block text-sm font-medium text-gray-700">
              {t('login.employeeIdLabel')}
            </label>
            <input
              type="text"
              id="employeeId"
              name="employeeId"
              placeholder={t('login.employeeIdPlaceholder')}
              value={employeeId}
              required
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              onChange={(e) => {
                const filteredValue = e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
                setEmployeeId(filteredValue);
              }}
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              {t('login.passwordLabel')}
            </label>
            <PasswordInput
              id="password"
              name="password"
              placeholder={t('login.passwordPlaceholder')}
              value={password}
              required
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={loginMutation.isPending}>
            {loginMutation.isPending ? t('common.processing') : t('login.submitButton')}
          </Button>
          {error && (
            <p className="mt-4 text-center text-sm text-red-600">
              {error}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
