import Redis from 'ioredis';

const globalForRedis = global as unknown as { redis: Redis };

const redisOptions = {
  connectTimeout: 5000,
  commandTimeout: 2000,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 0,
};

export const redis = globalForRedis.redis || new Redis(process.env.REDIS_URL || 'redis://localhost:6379', redisOptions);

if (process.env.NODE_ENV !== 'production') globalForRedis.redis = redis;
