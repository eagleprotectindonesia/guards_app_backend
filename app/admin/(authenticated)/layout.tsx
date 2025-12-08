import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import jwt from 'jsonwebtoken';
import Sidebar from './components/sidebar';
import Header from './components/header';
import { Toaster } from 'react-hot-toast';
import { getCurrentAdmin } from '@/lib/admin-auth';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_token');

  if (!token) {
    redirect('/admin/login');
  }

  try {
    jwt.verify(token.value, JWT_SECRET);
  } catch {
    redirect('/admin/login');
  }

  const currentAdmin = await getCurrentAdmin();

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Toaster position="top-right" containerStyle={{ zIndex: 99999 }} toastOptions={{ style: { zIndex: 99999 } }} />
      <Sidebar currentAdmin={currentAdmin} />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 p-8 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
