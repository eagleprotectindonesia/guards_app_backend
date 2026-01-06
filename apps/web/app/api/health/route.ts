import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';

export const dynamic = 'force-dynamic';

export async function GET() {
  const health = {
    status: 'UP',
    timestamp: new Date().toISOString(),
    services: {
      database: 'DOWN',
      redis: 'DOWN',
    },
  };

  try {
    // Check Database
    await prisma.$queryRaw`SELECT 1`;
    health.services.database = 'UP';
  } catch (error) {
    console.error('Health check database error:', error);
  }

  try {
    // Check Redis
    await redis.ping();
    health.services.redis = 'UP';
  } catch (error) {
    console.error('Health check redis error:', error);
  }

  const isHealthy = health.services.database === 'UP' && health.services.redis === 'UP';

  return NextResponse.json(health, {
    status: isHealthy ? 200 : 503,
  });
}
