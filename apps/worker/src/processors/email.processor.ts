import { Job } from 'bullmq';
import { SEND_EMAIL_JOB_NAME, sendTemplatedEmail } from '@repo/database';
import { EmailEventPayload } from '@repo/types';

type EmailFailureDisposition = 'permanent_non_retryable' | 'transient_retryable';

function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function classifyEmailFailure(error: unknown): EmailFailureDisposition {
  const message = toErrorMessage(error).toLowerCase();
  const name = error instanceof Error ? error.name.toLowerCase() : '';
  const metadata = (error as { $metadata?: { httpStatusCode?: number } } | undefined)?.$metadata;
  const statusCode = metadata?.httpStatusCode;

  if (message.includes('aws_ses_from_email is not configured')) {
    return 'permanent_non_retryable';
  }
  if (message.includes('missing email context key')) {
    return 'permanent_non_retryable';
  }
  if (message.includes('unsupported email template')) {
    return 'permanent_non_retryable';
  }
  if (message.includes('email address is not verified') || message.includes('identity failed the check')) {
    return 'permanent_non_retryable';
  }

  if (statusCode && statusCode >= 400 && statusCode < 500) {
    const isThrottlingLike =
      name.includes('throttl') || name.includes('toomanyrequest') || message.includes('throttl');
    return isThrottlingLike ? 'transient_retryable' : 'permanent_non_retryable';
  }

  return 'transient_retryable';
}

export class EmailProcessor {
  async process(job: Job<EmailEventPayload>) {
    if (job.name !== SEND_EMAIL_JOB_NAME) {
      return;
    }

    const payload = job.data;
    let result: { accepted: number };
    try {
      result = await sendTemplatedEmail(payload);
    } catch (error) {
      const disposition = classifyEmailFailure(error);
      if (disposition === 'permanent_non_retryable') {
        console.warn('[EmailProcessor] Skipping non-retryable email failure', {
          jobId: job.id,
          templateId: payload.templateId,
          recipients: payload.to.map(recipient => recipient.email),
          idempotencyKey: payload.idempotencyKey,
          errorMessage: toErrorMessage(error),
        });
        return;
      }
      throw error;
    }

    console.log('[EmailProcessor] Email sent', {
      jobId: job.id,
      templateId: payload.templateId,
      recipients: payload.to.length,
      accepted: result.accepted,
      idempotencyKey: payload.idempotencyKey,
    });
  }
}
