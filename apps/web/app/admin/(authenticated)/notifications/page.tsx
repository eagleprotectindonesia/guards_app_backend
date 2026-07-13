import { Metadata } from 'next';
import { getAdminSession } from '@/lib/admin-auth';
import { redirect } from 'next/navigation';
import AllNotificationsClient from './all-notifications-client';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Notification Center',
};

export default async function NotificationsPage() {
  const session = await getAdminSession();
  if (!session) {
    redirect('/admin/login');
  }

  return <AllNotificationsClient />;
}
