import { Metadata } from 'next';
import PwaRegistrar from './components/pwa-registrar';
import Providers from './providers';
// import InstallPrompt from './components/install-prompt';

export const metadata: Metadata = {
  title: 'Eagle Protect Guard',
  description: 'Aplikasi jadwal dan absensi guard',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'EP Guard',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    apple: "/employee/icons/icon.png", 
  },
};

export const viewport = {
  themeColor: '#2563eb',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function GuardRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Providers>
      <PwaRegistrar />
      {/* <InstallPrompt /> */}
      {children}
    </Providers>
  );
}