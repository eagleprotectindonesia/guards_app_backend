import sharp from 'sharp';
import { Readable } from 'stream';

const mockSend = jest.fn();

jest.mock('@repo/storage', () => ({
  GetObjectCommand: jest.fn(),
  s3Client: { send: mockSend },
  BUCKET_NAME: 'test-bucket',
}));

import { fetchPhotos, type PhotoInput } from './fetch-photos';

function mockS3Response(body: Buffer | null, contentType?: string) {
  return {
    Body: body
      ? {
          transformToByteArray: () => Promise.resolve(new Uint8Array(body)),
        }
      : null,
    ContentType: contentType ?? 'image/jpeg',
  };
}

describe('fetchPhotos', () => {
  const singleInput: PhotoInput[] = [{ s3Key: 'test/photo1.jpg', createdAt: new Date(), latitude: null, longitude: null }];

  beforeEach(() => {
    mockSend.mockReset();
  });

  test('returns empty array for empty input', async () => {
    const result = await fetchPhotos([], undefined);
    expect(result).toEqual([]);
    expect(mockSend).not.toHaveBeenCalled();
  });

  test('fetches a single photo successfully', async () => {
    const imageData = Buffer.from('fake-image-data');
    mockSend.mockResolvedValue(mockS3Response(imageData));

    const result = await fetchPhotos(singleInput);

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(1);
    expect(result[0].s3Key).toBe('test/photo1.jpg');
    expect(result[0].buffer).toEqual(imageData);
    expect(result[0].contentType).toBe('image/jpeg');
  });

  test('skips photo when S3 returns empty body', async () => {
    mockSend.mockResolvedValue(mockS3Response(null));

    const result = await fetchPhotos(singleInput);

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(0);
  });

  test('skips photo when S3 send throws an error', async () => {
    mockSend.mockRejectedValue(new Error('Network error'));

    const result = await fetchPhotos(singleInput);

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(0);
  });

  test('skips photo that times out via AbortSignal', async () => {
    mockSend.mockImplementation(
      (_command: unknown, options?: { abortSignal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          if (options?.abortSignal?.aborted) {
            reject(new DOMException('Aborted', 'AbortError'));
            return;
          }
          options?.abortSignal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          }, { once: true });
        }),
    );

    const result = await fetchPhotos(singleInput, AbortSignal.timeout(100));

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(0);
  }, 10_000);

  test('returns photos filtered by Promise.allSettled rejection', async () => {
    const inputs: PhotoInput[] = [
      { s3Key: 'test/good.jpg', createdAt: new Date(), latitude: null, longitude: null },
      { s3Key: 'test/bad.jpg', createdAt: new Date(), latitude: null, longitude: null },
      { s3Key: 'test/ugly.jpg', createdAt: new Date(), latitude: null, longitude: null },
    ];

    mockSend
      .mockResolvedValueOnce(mockS3Response(Buffer.from('good')))
      .mockRejectedValueOnce(new Error('Not found'))
      .mockResolvedValueOnce(mockS3Response(Buffer.from('ugly')));

    const result = await fetchPhotos(inputs);

    expect(mockSend).toHaveBeenCalledTimes(3);
    expect(result).toHaveLength(2);
    expect(result[0].s3Key).toBe('test/good.jpg');
    expect(result[1].s3Key).toBe('test/ugly.jpg');
  });

  test('passes abortSignal to s3Client.send', async () => {
    mockSend.mockResolvedValue(mockS3Response(Buffer.from('data')));
    const signal = AbortSignal.timeout(5_000);

    await fetchPhotos(singleInput, signal);

    expect(mockSend).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ abortSignal: signal }),
    );
  });

  test('resizes WebP image wider than 1280px to fit bounds and converts to PNG', async () => {
    const large = await sharp({
      create: { width: 3000, height: 2000, channels: 3, background: { r: 255, g: 0, b: 0 } },
    }).webp().toBuffer();

    mockSend.mockResolvedValue({
      Body: { transformToByteArray: () => Promise.resolve(new Uint8Array(large)) },
      ContentType: 'image/webp',
    });

    const result = await fetchPhotos([{ s3Key: 'test/large.webp', createdAt: new Date(), latitude: null, longitude: null }]);

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(1);
    expect(result[0].contentType).toBe('image/png');

    const meta = await sharp(result[0].buffer).metadata();
    expect(meta.width).toBeLessThanOrEqual(1280);
    expect(meta.format).toBe('png');
  }, 30_000);
});
