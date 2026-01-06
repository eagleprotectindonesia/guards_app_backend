import { getCurrentAdmin } from '@/lib/admin-auth';
import { redirect } from 'next/navigation';

export default async function AdminsLayout({ children }: { children: React.ReactNode }) {
  const currentAdmin = await getCurrentAdmin();

  if (currentAdmin?.role !== 'superadmin') {
    redirect('/admin/dashboard');
  }

  return <>{children}</>;
}
