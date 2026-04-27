import { Job } from 'bullmq';
import { SEND_EMAIL_JOB_NAME, sendTemplatedEmail } from '@repo/database';
import { EmailEventPayload } from '@repo/types';

export class EmailProcessor {
  async process(job: Job<EmailEventPayload>) {
    if (job.name !== SEND_EMAIL_JOB_NAME) {
      return;
    }

    const payload = job.data;
    const result = await sendTemplatedEmail(payload);

    console.log('[EmailProcessor] Email sent', {
      jobId: job.id,
      templateId: payload.templateId,
      recipients: payload.to.length,
      accepted: result.accepted,
      idempotencyKey: payload.idempotencyKey,
    });
  }
}
