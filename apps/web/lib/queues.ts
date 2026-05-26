import { Queue } from 'bullmq';
import { EMPLOYEE_SYNC_QUEUE_NAME } from '@repo/database';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

export const employeeSyncQueue = new Queue(EMPLOYEE_SYNC_QUEUE_NAME, {
  connection: {
    url: REDIS_URL,
    maxRetriesPerRequest: null,
  },
});
