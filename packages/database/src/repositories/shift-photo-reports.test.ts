import { getShiftReportPhotos } from './shift-photo-reports';
import { db as prisma } from '../prisma/client';

jest.mock('../prisma/client', () => ({
  db: {
    chatMessage: {
      findMany: jest.fn(),
    },
  },
}));

describe('getShiftReportPhotos', () => {
  const shift = { employeeId: 'emp-1', startsAt: new Date('2026-01-01T08:00:00Z'), endsAt: new Date('2026-01-01T16:00:00Z') };

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.chatMessage.findMany as jest.Mock).mockResolvedValue([]);
  });

  it('extracts lat/lng from attendance metadata.location', async () => {
    const attendance = {
      picture: 's3://attendance.jpg',
      recordedAt: new Date('2026-01-01T08:05:00Z'),
      metadata: { location: { lat: -8.6430162, lng: 115.1977971 } },
    };

    const photos = await getShiftReportPhotos({ shift, attendance });

    expect(photos).toHaveLength(1);
    expect(photos[0]!.latitude).toBe(-8.6430162);
    expect(photos[0]!.longitude).toBe(115.1977971);
    expect(photos[0]!.attendanceMatchedName).toBeNull();
  });

  it('extracts both matchedName and coordinates from attendance metadata', async () => {
    const attendance = {
      picture: 's3://attendance.jpg',
      recordedAt: new Date('2026-01-01T08:05:00Z'),
      metadata: {
        location: { lat: -8.6430162, lng: 115.1977971 },
        matchedLocation: { name: 'Main Gate', type: 'post', id: 'post-1', distanceMeters: 12 },
      },
    };

    const photos = await getShiftReportPhotos({ shift, attendance });

    expect(photos).toHaveLength(1);
    expect(photos[0]!.latitude).toBe(-8.6430162);
    expect(photos[0]!.longitude).toBe(115.1977971);
    expect(photos[0]!.attendanceMatchedName).toBe('Main Gate');
  });

  it('sets null lat/lng when attendance metadata.location is missing', async () => {
    const attendance = {
      picture: 's3://attendance.jpg',
      recordedAt: new Date('2026-01-01T08:05:00Z'),
      metadata: { matchedLocation: { name: 'Main Gate' } },
    };

    const photos = await getShiftReportPhotos({ shift, attendance });

    expect(photos[0]!.latitude).toBeNull();
    expect(photos[0]!.longitude).toBeNull();
    expect(photos[0]!.attendanceMatchedName).toBe('Main Gate');
  });

  it('sets null lat/lng when attendance metadata is absent', async () => {
    const attendance = {
      picture: 's3://attendance.jpg',
      recordedAt: new Date('2026-01-01T08:05:00Z'),
    };

    const photos = await getShiftReportPhotos({ shift, attendance });

    expect(photos[0]!.latitude).toBeNull();
    expect(photos[0]!.longitude).toBeNull();
    expect(photos[0]!.attendanceMatchedName).toBeNull();
  });

  it('sets null lat/lng when metadata.location.lat is not finite', async () => {
    const attendance = {
      picture: 's3://attendance.jpg',
      recordedAt: new Date('2026-01-01T08:05:00Z'),
      metadata: { location: { lat: NaN, lng: 115.197 } },
    };

    const photos = await getShiftReportPhotos({ shift, attendance });

    expect(photos[0]!.latitude).toBeNull();
    expect(photos[0]!.longitude).toBeNull();
  });

  it('returns empty array when no attendance picture and no chat messages', async () => {
    const photos = await getShiftReportPhotos({ shift, attendance: null });
    expect(photos).toEqual([]);
  });

  it('deduplicates attendance S3 key from chat messages', async () => {
    (prisma.chatMessage.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'msg-1',
        attachments: ['s3://attendance.jpg'],
        createdAt: new Date('2026-01-01T09:00:00Z'),
        latitude: null,
        longitude: null,
        content: 'duplicate key',
      },
    ]);

    const attendance = {
      picture: 's3://attendance.jpg',
      recordedAt: new Date('2026-01-01T08:05:00Z'),
      metadata: { location: { lat: -8.643, lng: 115.197 } },
    };

    const photos = await getShiftReportPhotos({ shift, attendance });

    expect(photos).toHaveLength(1);
    expect(photos[0]!.messageId).toBe('attendance');
    expect(photos[0]!.latitude).toBe(-8.643);
  });
});
