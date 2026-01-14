import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import { redirect } from 'next/navigation';
import { ReactNode } from 'react';
// import InstallPrompt from '../components/install-prompt';

export default async function GuardLoginLayout({ children }: { children: ReactNode }) {
  const guard = await getAuthenticatedEmployee();

  if (guard) {
    redirect('/employee');
  }

  return (
    <>
      {/* <InstallPrompt /> */}
      {children}
    </>
  );
}
