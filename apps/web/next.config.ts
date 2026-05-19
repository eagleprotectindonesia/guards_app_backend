import type { NextConfig } from 'next';
// import path from 'path';
// import dotenv from 'dotenv';

// 🌍 Load environment variables from the root .env file
// This ensures they are available on all machines/OSs without manual symlinking
// dotenv.config({ path: path.resolve(__dirname, '../../.env') });
// const isBeta = process.env.APP_ENV === 'beta';

const nextConfig: NextConfig = {
  /* config options here */
  // basePath: isBeta ? '/beta' : '',

  experimental: {
    authInterrupts: true,
  },
};

export default nextConfig;
