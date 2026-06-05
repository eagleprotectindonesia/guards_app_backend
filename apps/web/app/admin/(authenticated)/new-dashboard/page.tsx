import { redirect } from 'next/navigation';

export default function NewDashboardRedirect() {
  redirect('/admin/dashboard?dashboardTab=guard');
}
