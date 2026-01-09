import { defineConfig } from 'prisma/config';
import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Helper to load env from different possible locations
const loadEnv = () => {
  const paths = [
    path.resolve(__dirname, '../../.env'), // Monorepo root (local dev)
    path.resolve(__dirname, './.env'),      // Current dir (Docker /app)
    path.resolve(process.cwd(), '.env'),   // Current working dir
  ];

  for (const envPath of paths) {
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath });
      return;
    }
  }
  
  // Fallback to default dotenv behavior if no specific file found
  dotenv.config();
};

loadEnv();

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
