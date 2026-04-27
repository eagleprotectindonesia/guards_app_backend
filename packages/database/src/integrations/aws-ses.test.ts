import { sendTemplatedEmail } from './aws-ses';

const mockSend = jest.fn();
const mockSendEmailCommand = jest.fn().mockImplementation(input => ({ input }));

jest.mock('@aws-sdk/client-ses', () => ({
  SESClient: jest.fn().mockImplementation(() => ({
    send: (...args: unknown[]) => mockSend(...args),
  })),
  SendEmailCommand: jest.fn().mockImplementation((input: unknown) => mockSendEmailCommand(input)),
}));

describe('aws-ses integration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, AWS_SES_FROM_EMAIL: 'no-reply@example.com' };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('sends leave-request template email', async () => {
    mockSend.mockResolvedValue({ MessageId: 'msg-1' });

    const result = await sendTemplatedEmail({
      templateId: 'admin.leave_request_created',
      to: [{ email: 'admin@example.com', name: 'Admin' }],
      context: {
        notificationTitle: 'New leave request submitted',
        notificationBody: 'Employee requested leave.',
        targetUrl: 'http://localhost:3000/admin/leave-requests',
      },
      idempotencyKey: 'leave_request_created:leave-1:admin-1',
    });

    expect(result.accepted).toBe(1);
    expect(mockSendEmailCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        Destination: {
          ToAddresses: ['admin@example.com'],
        },
        Tags: expect.arrayContaining([
          expect.objectContaining({
            Name: 'idempotency_key',
            Value: 'leave_request_created-leave-1-admin-1',
          }),
        ]),
      })
    );
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  test('throws when required context is missing', async () => {
    await expect(
      sendTemplatedEmail({
        templateId: 'admin.leave_request_created',
        to: [{ email: 'admin@example.com' }],
        context: {
          notificationTitle: 'New leave request submitted',
          targetUrl: 'http://localhost:3000/admin/leave-requests',
        },
        idempotencyKey: 'leave_request_created:leave-1:admin-1',
      })
    ).rejects.toThrow('Missing email context key: notificationBody');
  });
});
