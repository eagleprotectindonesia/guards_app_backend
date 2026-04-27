import { Queue, JobsOptions } from 'bullmq';
import Redis from 'ioredis';
import { EmailEventPayload } from '@repo/types';
import { EMAIL_QUEUE_NAME, SEND_EMAIL_JOB_NAME } from './queues';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const queueConnection = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

const emailQueue = new Queue<EmailEventPayload>(EMAIL_QUEUE_NAME, {
  connection: queueConnection,
});

const DEFAULT_EMAIL_JOB_OPTIONS: JobsOptions = {
  attempts: 5,
  backoff: {
    type: 'exponential',
    delay: 1000,
  },
  removeOnComplete: true,
  removeOnFail: 100,
};

export async function enqueueEmailEvent(payload: EmailEventPayload, options?: JobsOptions) {
  return emailQueue.add(SEND_EMAIL_JOB_NAME, payload, {
    ...DEFAULT_EMAIL_JOB_OPTIONS,
    ...options,
  });
}
