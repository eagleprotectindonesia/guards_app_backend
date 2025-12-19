import { getAuthenticatedGuard } from '@/lib/guard-auth';
import { redirect } from 'next/navigation';
import { ReactNode } from 'react';
// import InstallPrompt from '../components/install-prompt';

export default async function GuardLoginLayout({ children }: { children: ReactNode }) {
  const guard = await getAuthenticatedGuard();

  if (guard) {
    redirect('/guard');
  }

  return (
    <>
      {/* <InstallPrompt /> */}
      {children}
    </>
  );
}
