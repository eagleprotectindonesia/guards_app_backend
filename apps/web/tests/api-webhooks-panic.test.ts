import { POST } from '../app/api/webhooks/panic/route';
import { NextRequest } from 'next/server';
import { redis } from '@repo/database/redis';

jest.mock('@repo/database/redis', () => ({
  redis: {
    set: jest.fn(),
    publish: jest.fn(),
  },
}));

// Helper to mock NextResponse.json if needed
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

describe('POST /api/webhooks/panic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('successfully stores unresolvedPanics in redis', async () => {
    const unresolvedPanics = [
      {
        id: 42,
        userId: 7,
        firstName: 'John',
        lastName: 'Doe',
        latitude: -6.2088,
        longitude: 106.8456,
        status: 'unresolved',
        createdAt: '2026-06-10T13:25:00.000+08:00',
      },
    ];

    const req = new NextRequest('http://localhost/api/webhooks/panic', {
      method: 'POST',
      body: JSON.stringify({
        event: 'panic.triggered',
        unresolvedPanics,
      }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.count).toBe(1);
    expect(redis.set).toHaveBeenCalledWith(
      'webhooks:unresolved_panics',
      JSON.stringify(unresolvedPanics)
    );
    expect(redis.publish).toHaveBeenCalledWith(
      'webhooks:panic',
      JSON.stringify({ unresolvedPanics })
    );
  });

  test('returns 400 if unresolvedPanics is missing or not an array', async () => {
    const req = new NextRequest('http://localhost/api/webhooks/panic', {
      method: 'POST',
      body: JSON.stringify({
        event: 'panic.triggered',
      }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid payload: unresolvedPanics must be an array');
    expect(redis.set).not.toHaveBeenCalled();
  });
});
