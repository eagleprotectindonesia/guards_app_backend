import { redirect } from 'next/navigation';
import { ReactNode } from 'react';
import { getAuthenticatedGuard } from '@/lib/guard-auth';
import SessionMonitor from './components/session-monitor';
import { redis } from '@/lib/redis';
import { ForcePasswordChangeModal } from '@/app/guard/components/password-change/force-password-change-modal';

export default async function GuardAuthenticatedLayout({ children }: { children: ReactNode }) {
  const guard = await getAuthenticatedGuard();

  if (!guard) {
    redirect('/guard/login');
  }

  const mustChangePassword = await redis.get(`guard:${guard.id}:must-change-password`);

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <SessionMonitor />
      <ForcePasswordChangeModal mustChange={!!mustChangePassword} />
      {/* No explicit header/sidebar for now, just the children */}
      <main className="grow">{children}</main>
    </div>
  );
}
