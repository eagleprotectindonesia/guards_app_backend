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
        source: '/api/guard/:path*',
        destination: '/api/employee/:path*',
        permanent: true,
      },
      {
        source: '/api/auth/guard/:path*',
        destination: '/api/auth/employee/:path*',
        permanent: true,
      },
      {
        source: '/guard/:path*',
        destination: '/employee/:path*',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;