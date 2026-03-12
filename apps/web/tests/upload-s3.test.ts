const sendMock = jest.fn();
const getSignedUrlMock = jest.fn();

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({
    send: sendMock,
  })),
  PutObjectCommand: jest.fn().mockImplementation(input => ({ input })),
  GetObjectCommand: jest.fn().mockImplementation(input => ({ input })),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: getSignedUrlMock,
}));

jest.mock('@/lib/redis', () => ({
  redis: {
    get: jest.fn(),
    set: jest.fn(),
  },
}));

describe('upload and s3 helpers', () => {
  const originalEnv = process.env;
  const originalWarn = console.warn;
  let warnSpy: jest.Mock;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      AWS_REGION: 'us-east-1',
      AWS_ACCESS_KEY_ID: 'test-key',
      AWS_SECRET_ACCESS_KEY: 'test-secret',
      AWS_S3_BUCKET_NAME: 'test-bucket',
      NODE_ENV: 'test',
    };
    getSignedUrlMock.mockResolvedValue('https://signed.example/upload');
    sendMock.mockResolvedValue({});
    warnSpy = jest.fn();
    console.warn = warnSpy;
  });

  afterAll(() => {
    process.env = originalEnv;
    console.warn = originalWarn;
  });

  test('getPresignedUploadUrl builds structured chat keys when metadata is present', async () => {
    const { getPresignedUploadUrl } = await import('@/lib/s3');

    const result = await getPresignedUploadUrl('photo.png', 'image/png', {
      folder: 'chat',
      conversationId: 'emp-123',
      messageId: 'msg-456',
      fileType: 'image',
    });

    expect(result.key).toMatch(
      /^chat\/env=test\/conv_emp-123\/msg_msg-456\/image\/[0-9a-f-]+\.png$/
    );
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test('getPresignedUploadUrl falls back and logs when chat metadata is missing', async () => {
    const { getPresignedUploadUrl } = await import('@/lib/s3');

    const result = await getPresignedUploadUrl('../odd/name.png', 'image/png', {
      folder: 'chat',
      conversationId: 'emp-123',
      fileType: 'image',
    });

    expect(result.key).toMatch(/^chat\/\d+-odd-name\.png$/);
    expect(warnSpy).toHaveBeenCalledWith(
      '[S3 Upload] Falling back to generic chat key due to missing metadata',
      expect.objectContaining({
        context: 'presigned',
        folder: 'chat',
        hasConversationId: true,
        hasMessageId: false,
        fileName: '../odd/name.png',
      })
    );
  });

  test('uploadToS3 rejects chat uploads without conversationId', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const { uploadToS3 } = await import('@/lib/upload');
    const file = new File(['abc'], 'photo.png', { type: 'image/png' });

    await expect(
      uploadToS3(file, {
        folder: 'chat',
        messageId: 'msg-456',
        fileType: 'image',
      })
    ).rejects.toThrow('Chat uploads require a conversationId');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('uploadToS3 rejects chat uploads without messageId', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const { uploadToS3 } = await import('@/lib/upload');
    const file = new File(['abc'], 'photo.png', { type: 'image/png' });

    await expect(
      uploadToS3(file, {
        folder: 'chat',
        conversationId: 'emp-123',
        fileType: 'image',
      })
    ).rejects.toThrow('Chat uploads require a messageId');

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
