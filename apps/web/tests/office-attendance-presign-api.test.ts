import { POST } from '../app/api/admin/office-attendance/presign/route';
import type { NextRequest } from 'next/server';
import { adminHasPermission, getAdminAuthSession } from '@/lib/admin-auth';
import { canAccessOfficeAttendance } from '@/lib/auth/admin-visibility';
import { getCachedPresignedDownloadUrl } from '@/lib/s3';

jest.mock('@/lib/admin-auth', () => ({
  adminHasPermission: jest.fn(),
  getAdminAuthSession: jest.fn(),
}));

jest.mock('@/lib/auth/admin-visibility', () => ({
  canAccessOfficeAttendance: jest.fn(),
}));

jest.mock('@/lib/s3', () => ({
  getCachedPresignedDownloadUrl: jest.fn(),
}));

jest.mock('next/server', () => {
  const actual = jest.requireActual('next/server');
  return {
    ...actual,
    NextResponse: {
      ...actual.NextResponse,
      json: jest.fn((body, init) => ({
        json: async () => body,
        status: init?.status || 200,
      })),
    },
  };
});

function buildRequest(body: unknown): NextRequest {
  return new Request('http://localhost/api/admin/office-attendance/presign', {
    method: 'POST',
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

describe('POST /api/admin/office-attendance/presign', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (adminHasPermission as jest.Mock).mockReturnValue(true);
    (canAccessOfficeAttendance as jest.Mock).mockReturnValue(true);
    (getCachedPresignedDownloadUrl as jest.Mock).mockResolvedValue('https://signed.example/test.png');
  });

  test('returns 401 when the session is missing', async () => {
    (getAdminAuthSession as jest.Mock).mockResolvedValue(null);

    const response = await POST(buildRequest({ key: 'k1' }));
    expect(response.status).toBe(401);
  });

  test('returns 403 when the session lacks the office attendance view permission', async () => {
    (getAdminAuthSession as jest.Mock).mockResolvedValue({ id: 'admin-1' });
    (adminHasPermission as jest.Mock).mockReturnValue(false);

    const response = await POST(buildRequest({ key: 'k1' }));
    expect(response.status).toBe(403);
  });

  test('returns 403 when canAccessOfficeAttendance is false', async () => {
    (getAdminAuthSession as jest.Mock).mockResolvedValue({ id: 'admin-1' });
    (canAccessOfficeAttendance as jest.Mock).mockReturnValue(false);

    const response = await POST(buildRequest({ key: 'k1' }));
    expect(response.status).toBe(403);
  });

  test('returns 400 when the key is missing', async () => {
    (getAdminAuthSession as jest.Mock).mockResolvedValue({ id: 'admin-1' });

    const response = await POST(buildRequest({}));
    expect(response.status).toBe(400);
  });

  test('returns 400 when the body is not valid JSON', async () => {
    (getAdminAuthSession as jest.Mock).mockResolvedValue({ id: 'admin-1' });

    const req = new Request('http://localhost/api/admin/office-attendance/presign', {
      method: 'POST',
      body: 'not-json',
    }) as unknown as NextRequest;
    const response = await POST(req);
    expect(response.status).toBe(400);
  });

  test('returns a presigned URL for a valid key', async () => {
    (getAdminAuthSession as jest.Mock).mockResolvedValue({ id: 'admin-1' });

    const response = await POST(buildRequest({ key: 'office/clock-in.png' }));
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data).toEqual({ url: 'https://signed.example/test.png' });
    expect(getCachedPresignedDownloadUrl).toHaveBeenCalledWith('office/clock-in.png');
  });

  test('returns the original URL when the key is already a full https URL', async () => {
    (getAdminAuthSession as jest.Mock).mockResolvedValue({ id: 'admin-1' });

    const response = await POST(
      buildRequest({ key: 'https://cdn.example/clock-in.png' })
    );
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data).toEqual({ url: 'https://cdn.example/clock-in.png' });
    expect(getCachedPresignedDownloadUrl).not.toHaveBeenCalled();
  });
});
