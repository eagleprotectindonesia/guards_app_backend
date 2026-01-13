import { redirect } from 'next/navigation';
import Sidebar from './components/sidebar';
import Header from './components/header';
import { Toaster } from 'react-hot-toast';
import { getAdminSession } from '@/lib/admin-auth';
import { AlertProvider } from './context/alert-context';
import { SessionProvider } from './context/session-context';
import GlobalAlertManager from './components/global-alert-manager';
import { Metadata } from 'next';
import { AdminBreadcrumb } from './components/admin-breadcrumb';
import { SocketProvider } from '@/components/socket-provider';
import FloatingChatWidget from './components/floating-chat-widget';

export const metadata: Metadata = {
  title: {
    template: '%s | Eagle Protect',
    default: 'Admin Dashboard | Eagle Protect',
  },
  description: 'Security guard scheduling and real-time monitoring system.',
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminSession();

  if (!session) {
    redirect('/admin/login');
  }

  return (
    <SessionProvider
      session={{
        userId: session.id,
        roleName: session.roleName,
        permissions: session.permissions,
      }}
    >
      <SocketProvider role="admin">
        <AlertProvider>
          <div className="flex min-h-screen bg-background">
            <Toaster
              position="top-right"
              containerStyle={{ zIndex: 99999 }}
              toastOptions={{ style: { zIndex: 99999 } }}
            />
            <Sidebar currentAdmin={session} />
            <div className="flex-1 flex flex-col">
              <Header />
              <div className="px-8 pt-4">
                <AdminBreadcrumb />
              </div>
              <main className="flex-1 p-8 overflow-y-auto">{children}</main>
            </div>
            <GlobalAlertManager />
            <FloatingChatWidget />
          </div>
        </AlertProvider>
      </SocketProvider>
    </SessionProvider>
  );
}
