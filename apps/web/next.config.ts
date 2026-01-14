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
};

export default nextConfig;
