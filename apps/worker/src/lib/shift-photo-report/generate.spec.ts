import sharp from 'sharp';
import { generatePdf, generateReportFileName } from './generate';
import type { FetchedPhoto } from './fetch-photos';

describe('generatePdf', () => {
  const metadata = {
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
  test('produces safe filename from metadata', () => {
    const result = generateReportFileName('Abu Hanivan Naneng', 'EP0098', new Date('2026-06-15T00:00:00Z'));
    expect(result).toBe('shift-report_Abu_Hanivan_Naneng_EP0098_2026-06-15.pdf');
  });

  test('replaces special characters in guard name', () => {
    const result = generateReportFileName('Test/Guard!@#', '0001', new Date('2026-06-15T00:00:00Z'));
    expect(result).toBe('shift-report_Test_Guard____0001_2026-06-15.pdf');
  });
});
