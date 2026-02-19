import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { EMPLOYEE_SYNC_QUEUE_NAME } from '@repo/shared';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// BullMQ needs maxRetriesPerRequest: null — a dedicated connection
const bullmqRedis = new Redis(REDIS_URL, { maxRetriesPerRequest: null });

export const employeeSyncQueue = new Queue(EMPLOYEE_SYNC_QUEUE_NAME, {
  connection: bullmqRedis,
});
