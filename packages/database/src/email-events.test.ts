import { enqueueEmailEvent } from './email-events';

const mockAdd = jest.fn();

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: (...args: unknown[]) => mockAdd(...args),
  })),
}));

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({}));
});

describe('email-events', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('enqueueEmailEvent enqueues with defaults', async () => {
    mockAdd.mockResolvedValue({ id: 'job-1' });

    await enqueueEmailEvent({
      templateId: 'admin.leave_request_created',
      to: [{ email: 'admin@example.com', name: 'Admin' }],
      context: {
        notificationTitle: 'New leave request submitted',
        notificationBody: 'Employee requested leave.',
        targetUrl: 'http://localhost:3000/admin/leave-requests',
      },
      idempotencyKey: 'leave_request_created:leave-1:admin-1',
    });

    expect(mockAdd).toHaveBeenCalledWith(
      'send-email',
      expect.any(Object),
      expect.objectContaining({
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: true,
        removeOnFail: 100,
      })
    );
  });
});
