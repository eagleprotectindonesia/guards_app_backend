'use client';

import { useRouter } from 'next/navigation';
import { ReactNode, useEffect } from 'react';
import SessionMonitor from './components/session-monitor';
import { ForcePasswordChangeModal } from '@/app/employee/components/password-change/force-password-change-modal';
import { BottomNav } from './components/bottom-nav';
import { TopNav } from './components/top-nav';
import { useProfile } from './hooks/use-employee-queries';
import { useTranslation } from 'react-i18next';
import { SocketProvider } from '@/components/socket-provider';

export default function GuardAuthenticatedLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { data: profile, isLoading, isError } = useProfile();

  useEffect(() => {
    if (!isLoading && (isError || !profile)) {
      router.push('/employee/login');
    }
  }, [profile, isLoading, isError, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <p className="text-gray-500">{t('common.loading')}</p>
      </div>
    );
  }

  if (!profile) {
    return null;
  }

  return (
    <SocketProvider role="employee">
      <div className="min-h-screen bg-gray-100 flex flex-col">
        <SessionMonitor />
        <ForcePasswordChangeModal mustChange={profile.mustChangePassword} />
        <TopNav />
        <main className="grow pb-24 flex flex-col">{children}</main>
        <BottomNav />
      </div>
    </SocketProvider>
  );
}