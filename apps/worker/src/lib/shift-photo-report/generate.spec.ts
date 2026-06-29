import sharp from 'sharp';
import { generatePdf, generateReportFileName } from './generate';
import type { FetchedPhoto } from './fetch-photos';

describe('generatePdf', () => {
  const metadata = {
    reportNumber: null,
    status: 'pending',
    guardName: 'Test Guard',
    employeeNumber: 'EP0001',
    clientName: 'Test Client',
    siteName: 'Test Site',
    shiftStartsAt: new Date('2026-06-15T08:00:00Z'),
    shiftEndsAt: new Date('2026-06-15T17:00:00Z'),
    photoCount: 0,
  };

  test('produces a valid PDF buffer with no photos', async () => {
    const buffer = await generatePdf(metadata, []);

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(100);
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
  });

  test('produces a valid PDF buffer with one photo page', async () => {
    const photoBuffer = await sharp({
      create: { width: 1, height: 1, channels: 3, background: { r: 255, g: 0, b: 0 } },
    }).png().toBuffer();

    const photos: FetchedPhoto[] = [
      {
        buffer: photoBuffer,
        s3Key: 'test/photo.png',
        createdAt: new Date('2026-06-15T10:30:00Z'),
        contentType: 'image/png',
      },
    ];

    const buffer = await generatePdf(metadata, photos);

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(100);
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
  });

  test('produces a valid PDF with long guard name and site name', async () => {
    const longMetadata = {
      ...metadata,
      reportNumber: null,
      guardName: 'Abu Hanivan Naneng',
      employeeNumber: 'EP0098',
      clientName: 'Headquarters Owner',
      siteName: 'Site 2 Head quarters',
      photoCount: 5,
    };

    const buffer = await generatePdf(longMetadata, []);

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(100);
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
  });
});

describe('generateReportFileName', () => {
  const shiftStartsAt = new Date('2026-06-15T15:00:00Z');
  const shiftEndsAt = new Date('2026-06-15T23:00:00Z');

  test('produces filename in the new EP format', () => {
    const result = generateReportFileName({
      siteName: 'SLK Cambridge School',
      shiftStartsAt,
      shiftEndsAt,
      reportNumber: '2026-06-15-00042',
      fallbackId: 'ignored',
    });
    expect(result).toBe('EP - SLK Cambridge School - 2026-06-15 - 23-00 to 07-00 - RPT00042.pdf');
  });

  test('sanitizes special characters in site name and falls back for null reportNumber', () => {
    const result = generateReportFileName({
      siteName: 'Site/With: Bad*Chars?',
      shiftStartsAt,
      shiftEndsAt,
      reportNumber: null,
      fallbackId: 'my-uuid-1234',
    });
    expect(result).toBe('EP - SiteWith BadChars - 2026-06-15 - 23-00 to 07-00 - RPTmy-uuid.pdf');
  });
});

describe('generatePdf abort signal', () => {
  const metadata = {
    reportNumber: null,
    status: 'pending',
    guardName: 'Test Guard',
    employeeNumber: 'EP0001',
    clientName: 'Test Client',
    siteName: 'Test Site',
    shiftStartsAt: new Date('2026-06-15T08:00:00Z'),
    shiftEndsAt: new Date('2026-06-15T17:00:00Z'),
    photoCount: 0,
  };

  test('rejects when pre-aborted signal is provided', async () => {
    const abortedSignal = AbortSignal.abort();
    await expect(generatePdf(metadata, [], abortedSignal)).rejects.toThrow('Aborted');
  });

  test('rejects when signal is aborted during generation', async () => {
    const controller = new AbortController();
    const promise = generatePdf(metadata, [], controller.signal);
    controller.abort();
    await expect(promise).rejects.toThrow('Aborted');
  });
});
