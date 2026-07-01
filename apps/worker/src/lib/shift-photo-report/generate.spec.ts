import sharp from 'sharp';
import { generatePdf, generateReportFileName, buildReportMetadata, buildPhotoEvidenceTitle, buildPhotoEvidenceCaption } from './generate';
import type { FetchedPhoto } from './fetch-photos';

function makeMetadata(overrides: Partial<Parameters<typeof buildReportMetadata>[0]> = {}) {
  return buildReportMetadata({
    reportNumber: null,
    status: 'pending',
    guardName: 'Test Guard',
    employeeNumber: 'EP0001',
    clientName: 'Test Client',
    siteName: 'Test Site',
    shiftTypeName: 'Day Shift',
    shiftStartsAt: new Date('2026-06-15T08:00:00Z'),
    shiftEndsAt: new Date('2026-06-15T17:00:00Z'),
    photoCount: 0,
    locationUpdateCount: 0,
    firstLocation: null,
    lastLocation: null,
    geofenceSummary: 'No GPS records available for this shift.',
    ...overrides,
  });
}

function makeFetchedPhoto(overrides: Partial<FetchedPhoto> = {}): FetchedPhoto {
  return {
    buffer: Buffer.from([]),
    s3Key: 'test/photo.png',
    createdAt: new Date('2026-06-15T10:30:00Z'),
    uploadedAt: new Date('2026-06-15T10:30:31Z'),
    contentType: 'image/png',
    latitude: null,
    longitude: null,
    locationName: 'On Site',
    geofenceStatus: 'no-location',
    chatContent: null,
    attendanceMatchedName: null,
    ...overrides,
  };
}

function countPdfPages(buffer: Buffer): number {
  const text = buffer.toString('latin1');
  const matches = text.match(/\/Type\s*\/Page\b/g);
  return matches ? matches.length : 0;
}

describe('generatePdf', () => {
  const metadata = makeMetadata();

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
      makeFetchedPhoto({
        buffer: photoBuffer,
        s3Key: 'test/photo.png',
        createdAt: new Date('2026-06-15T10:30:00Z'),
        contentType: 'image/png',
        latitude: -8.655812,
        longitude: 115.219442,
        locationName: 'Main Gate',
        geofenceStatus: 'inside',
      }),
    ];

    const buffer = await generatePdf(metadata, photos);

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(100);
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
  });

  test('produces a valid PDF with long guard name and site name', async () => {
    const longMetadata = makeMetadata({
      reportNumber: null,
      guardName: 'Abu Hanivan Naneng',
      employeeNumber: 'EP0098',
      clientName: 'Headquarters Owner',
      siteName: 'Site 2 Head quarters',
      shiftTypeName: 'Night Shift',
      photoCount: 5,
    });

    const buffer = await generatePdf(longMetadata, []);

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(100);
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
  });

  test('renders cover page with location summary and named points', async () => {
    const enriched = makeMetadata({
      reportNumber: '2026-06-15-00042',
      status: 'generated',
      locationUpdateCount: 7,
      photoCount: 3,
      firstLocation: {
        timestamp: new Date('2026-06-15T09:39:41Z'),
        pointName: 'Main Gate',
        latitude: -8.655812,
        longitude: 115.219442,
      },
      lastLocation: {
        timestamp: new Date('2026-06-15T16:55:12Z'),
        pointName: 'Handover Point',
        latitude: -8.655844,
        longitude: 115.219500,
      },
      geofenceSummary: 'All 7 GPS records are within the expected site/escort boundary.',
    });

    const buffer = await generatePdf(enriched, []);

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    // Cover page adds a notable amount of bytes (tables, stat cards, watermark)
    expect(buffer.length).toBeGreaterThan(2000);
  });

  test('no-photos case produces 2 pages (cover + no-photos message), both with chrome', async () => {
    const buffer = await generatePdf(metadata, []);
    // 1 cover + 1 "No photo evidence submitted during this shift." page
    expect(countPdfPages(buffer)).toBe(2);
  });

  test('N photos produce N+1 pages (cover + one per photo), all with chrome', async () => {
    const photoBuffer = await sharp({
      create: { width: 1, height: 1, channels: 3, background: { r: 255, g: 0, b: 0 } },
    }).png().toBuffer();

    const photos: FetchedPhoto[] = [1, 2, 3].map(i =>
      makeFetchedPhoto({
        buffer: photoBuffer,
        s3Key: `test/photo${i}.png`,
        createdAt: new Date(`2026-06-15T1${i}:00:00Z`),
        contentType: 'image/png',
        latitude: -8.655812,
        longitude: 115.219442,
        locationName: 'Main Gate',
        geofenceStatus: 'inside',
      }),
    );

    const buffer = await generatePdf(metadata, photos);
    expect(countPdfPages(buffer)).toBe(photos.length + 1);
  });

  test('cover page does not trigger a second empty chrome-only page (regression)', async () => {
    // Regression test: the old chrome bug produced an extra blank page (chrome only,
    // no content) before the actual cover. With max pages = 2 for the no-photos case,
    // a blank third page would mean the chrome is triggering auto-pagination again.
    const buffer = await generatePdf(metadata, []);
    expect(countPdfPages(buffer)).toBeLessThanOrEqual(2);
  });

  test('falls back to "PENDING" reportNumberShort when no reportNumber is provided', async () => {
    const m = makeMetadata({ reportNumber: null });
    expect(m.reportNumberShort).toBe('PENDING');
  });

  test('extracts RPTxxxxx from a YYYY-MM-DD-NNNNN reportNumber', async () => {
    const m = makeMetadata({ reportNumber: '2026-06-15-00042' });
    expect(m.reportNumberShort).toBe('RPT00042');
  });
});

describe('buildPhotoEvidenceTitle', () => {
  test('uses the post name and "Location Verified" when coordinates are present', () => {
    const title = buildPhotoEvidenceTitle({ photoIndex: 1, locationName: 'Main Gate', hasLocation: true });
    expect(title).toBe('Photo Evidence #1 - Main Gate | Location Verified');
  });

  test('uses the post name and "Location Unavailable" when coordinates are missing', () => {
    const title = buildPhotoEvidenceTitle({ photoIndex: 3, locationName: 'Handover Point', hasLocation: false });
    expect(title).toBe('Photo Evidence #3 - Handover Point | Location Unavailable');
  });

  test('uses "Main Site" when the site has a single post', () => {
    const title = buildPhotoEvidenceTitle({ photoIndex: 1, locationName: 'Main Site', hasLocation: true });
    expect(title).toBe('Photo Evidence #1 - Main Site | Location Verified');
  });
});

describe('buildPhotoEvidenceCaption', () => {
  test('renders the photo-overlay caption with chat content as remarks', () => {
    const photo = makeFetchedPhoto({
      createdAt: new Date('2026-06-28T14:39:41Z'),
      locationName: 'Main Gate',
      chatContent: 'Front gate secured before shift start.',
    });
    const caption = buildPhotoEvidenceCaption(photo, 'Main Gate', 1);
    expect(caption).toContain('Photo Evidence #1 - Main Gate');
    expect(caption).toContain('Captured 2026-06-28 22:39:41 WITA');
    expect(caption).toContain('Front gate secured before shift start.');
  });

  test('falls back to "Sample visual" when chat content is empty', () => {
    const photo = makeFetchedPhoto({
      createdAt: new Date('2026-06-28T14:00:00Z'),
      locationName: 'Main Gate',
      chatContent: null,
    });
    const caption = buildPhotoEvidenceCaption(photo, 'Main Gate', 1);
    expect(caption).toContain('Sample visual');
  });

  test('trims whitespace in the chat content', () => {
    const photo = makeFetchedPhoto({
      createdAt: new Date('2026-06-28T14:00:00Z'),
      locationName: 'Main Gate',
      chatContent: '   Lots of trailing whitespace   ',
    });
    const caption = buildPhotoEvidenceCaption(photo, 'Main Gate', 1);
    expect(caption).toContain('Lots of trailing whitespace');
    expect(caption).not.toContain('   Lots');
  });
});

describe('generatePdf photo evidence page (render integration)', () => {
  const metadata = makeMetadata();

  async function makePhotoBuffer(): Promise<Buffer> {
    return sharp({
      create: { width: 1, height: 1, channels: 3, background: { r: 255, g: 0, b: 0 } },
    }).png().toBuffer();
  }

  test('photo with location generates a valid photo page (cover + photo = 2 pages)', async () => {
    const photoBuffer = await makePhotoBuffer();
    const photos: FetchedPhoto[] = [
      makeFetchedPhoto({
        buffer: photoBuffer,
        s3Key: 'evidence/main-gate.png',
        createdAt: new Date('2026-06-28T14:39:41Z'),
        contentType: 'image/png',
        latitude: -8.655812,
        longitude: 115.219442,
        locationName: 'Main Gate',
        geofenceStatus: 'inside',
        chatContent: 'Front gate secured before shift start.',
      }),
    ];

    const buffer = await generatePdf(metadata, photos);

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    // Cover page + 1 evidence page = 2 pages
    expect(countPdfPages(buffer)).toBe(2);
    // The evidence page is substantially larger than the cover alone because of
    // the image embed, map widget, and detail table.
    expect(buffer.length).toBeGreaterThan(4000);
  });

  test('photo with no coordinates still produces a valid photo page', async () => {
    const photoBuffer = await makePhotoBuffer();
    const photos: FetchedPhoto[] = [
      makeFetchedPhoto({
        buffer: photoBuffer,
        s3Key: 'evidence/attendance.png',
        createdAt: new Date('2026-06-28T14:00:00Z'),
        contentType: 'image/png',
        latitude: null,
        longitude: null,
        locationName: 'Main Gate',
        geofenceStatus: 'no-location',
        attendanceMatchedName: 'Main Gate',
      }),
    ];

    const buffer = await generatePdf(metadata, photos);
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(countPdfPages(buffer)).toBe(2);
  });

  test('three photos produce cover + three evidence pages = 4 pages', async () => {
    const photoBuffer = await makePhotoBuffer();
    const photos: FetchedPhoto[] = [1, 2, 3].map(i =>
      makeFetchedPhoto({
        buffer: photoBuffer,
        s3Key: `evidence/photo${i}.png`,
        createdAt: new Date(`2026-06-28T1${i}:00:00Z`),
        contentType: 'image/png',
        latitude: -8.655812,
        longitude: 115.219442,
        locationName: 'Main Gate',
        geofenceStatus: 'inside',
      }),
    );

    const buffer = await generatePdf(metadata, photos);
    expect(countPdfPages(buffer)).toBe(4);
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
  const metadata = makeMetadata();

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
