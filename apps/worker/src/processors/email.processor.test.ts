import { EmailProcessor } from './email.processor';
import { SEND_EMAIL_JOB_NAME, sendTemplatedEmail } from '@repo/database';

jest.mock('@repo/database', () => ({
  SEND_EMAIL_JOB_NAME: 'send-email',
  sendTemplatedEmail: jest.fn(),
}));

describe('EmailProcessor', () => {
  const processor = new EmailProcessor();
  const payload = {
    templateId: 'admin.leave_request_created' as const,
    to: [{ email: 'admin@example.com', name: 'Admin' }],
    context: {
      notificationTitle: 'New leave request submitted',
      notificationBody: 'Employee requested leave.',
      targetUrl: 'http://localhost:3000/admin/leave-requests',
    },
    idempotencyKey: 'leave_request_created:leave-1:admin-1',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('skips non-email jobs', async () => {
    const job = {
      id: 'job-1',
      name: 'other-job',
      data: payload,
    } as any;

    await processor.process(job);

    expect(sendTemplatedEmail).not.toHaveBeenCalled();
  });

  test('skips non-retryable SES unverified recipient failures', async () => {
    (sendTemplatedEmail as jest.Mock).mockRejectedValue(
      new Error(
        'Email address is not verified. The following identities failed the check in region AP-SOUTHEAST-1: test@example.com'
      )
    );

    const job = {
      id: 'job-2',
      name: SEND_EMAIL_JOB_NAME,
      data: payload,
    } as any;

    await expect(processor.process(job)).resolves.toBeUndefined();
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  test('skips non-retryable app config/template/context failures', async () => {
    (sendTemplatedEmail as jest.Mock).mockRejectedValue(new Error('Unsupported email template: unknown'));

    const job = {
      id: 'job-3',
      name: SEND_EMAIL_JOB_NAME,
      data: payload,
    } as any;

    await expect(processor.process(job)).resolves.toBeUndefined();
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  test('rethrows retryable throttling-like 429 errors', async () => {
    const throttlingError = Object.assign(new Error('Rate exceeded'), {
      name: 'TooManyRequestsException',
      $metadata: { httpStatusCode: 429 },
    });
    (sendTemplatedEmail as jest.Mock).mockRejectedValue(throttlingError);

    const job = {
      id: 'job-4',
      name: SEND_EMAIL_JOB_NAME,
      data: payload,
    } as any;

    await expect(processor.process(job)).rejects.toThrow('Rate exceeded');
  });

  test('rethrows unknown errors by default', async () => {
    (sendTemplatedEmail as jest.Mock).mockRejectedValue(new Error('socket hang up'));

    const job = {
      id: 'job-5',
      name: SEND_EMAIL_JOB_NAME,
      data: payload,
    } as any;

    await expect(processor.process(job)).rejects.toThrow('socket hang up');
  });
});
