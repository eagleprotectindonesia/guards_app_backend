import { Queue, JobsOptions } from 'bullmq';
import { EmailEventPayload } from '@repo/types';
import { EMAIL_QUEUE_NAME, SEND_EMAIL_JOB_NAME } from './queues';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const emailQueue = new Queue<EmailEventPayload, void, typeof SEND_EMAIL_JOB_NAME>(EMAIL_QUEUE_NAME, {
  connection: {
    url: REDIS_URL,
  },
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
