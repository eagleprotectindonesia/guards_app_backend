import type { NextConfig } from 'next';
import path from 'path';
import dotenv from 'dotenv';

// 🌍 Load environment variables from the root .env file
// This ensures they are available on all machines/OSs without manual symlinking
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const nextConfig: NextConfig = {
  output: 'standalone',
  /* config options here */
  experimental: {
    authInterrupts: true,
  },
  async redirects() {
    return [
      {
        source: '/api/auth/employee/:path*',
        destination: '/api/employee/auth/:path*',
        permanent: true,
      },
      {
        source: '/api/auth/login',
        destination: '/api/admin/auth/login',
        permanent: true,
      },
      {
        source: '/api/auth/logout',
        destination: '/api/admin/auth/logout',
        permanent: true,
      },
      {
        source: '/api/auth/verify-2fa',
        destination: '/api/admin/auth/verify-2fa',
        permanent: true,
      },
      {
        source: '/api/chat/:path*',
        destination: '/api/shared/chat/:path*',
        permanent: true,
      },
      {
        source: '/api/upload/:path*',
        destination: '/api/shared/upload/:path*',
        permanent: true,
      },
      {
        source: '/api/my/:path*',
        destination: '/api/employee/my/:path*',
        permanent: true,
      },
      {
        source: '/api/shifts/:path*',
        destination: '/api/employee/shifts/:path*',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
