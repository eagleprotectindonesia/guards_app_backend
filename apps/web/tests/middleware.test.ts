import { NextRequest } from 'next/server';
import { proxy } from '../proxy';
import { validateApiKeyInDb } from '@/lib/api-key';

// Mock prisma to prevent open database handles
jest.mock('@/lib/prisma', () => ({
  prisma: {
    apiKey: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

// Mock validateApiKeyInDb
jest.mock('@/lib/api-key', () => ({
  validateApiKeyInDb: jest.fn(),
}));

// Mock verifySession to avoid DB calls
jest.mock('@/lib/auth/session', () => ({
  verifySession: jest.fn(),
}));

// Helper to mock NextResponse.json
jest.mock('next/server', () => {
  const actual = jest.requireActual('next/server');
  return {
    ...actual,
    NextResponse: {
      ...actual.NextResponse,
      json: jest.fn((body, init) => ({
        json: async () => body,
        status: init?.status || 200,
        headers: new Headers(),
      })),
      next: jest.fn(() => ({
        status: 200,
        headers: new Headers(),
      })),
    },
  };
});

describe('Middleware - External API Auth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('blocks /api/external/v1/employees without API key', async () => {
    const req = new NextRequest(new URL('http://localhost/api/external/v1/employees'));
    
    const response = await proxy(req);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data?.error).toBe('Unauthorized: Missing API Key');
  });

  test('blocks /api/external/v1/employees with invalid API key', async () => {
    const req = new NextRequest(new URL('http://localhost/api/external/v1/employees'), {
      headers: { 'X-API-KEY': 'invalid-key' }
    });
    
    (validateApiKeyInDb as jest.Mock).mockResolvedValue(null);

    const response = await proxy(req);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data?.error).toBe('Unauthorized: Invalid API Key');
    expect(validateApiKeyInDb).toHaveBeenCalledWith('invalid-key');
  });

  test('allows /api/external/v1/employees with valid API key', async () => {
    const req = new NextRequest(new URL('http://localhost/api/external/v1/employees'), {
      headers: { 'X-API-KEY': 'valid-key' }
    });
    
    (validateApiKeyInDb as jest.Mock).mockResolvedValue({ id: 'key-1', name: 'Test Key' });

    const response = await proxy(req);

    // If it's valid, it should call NextResponse.next()
    expect(response.status).toBe(200);
    expect(validateApiKeyInDb).toHaveBeenCalledWith('valid-key');
  });
});
