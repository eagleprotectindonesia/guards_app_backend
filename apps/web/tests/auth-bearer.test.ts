import { NextRequest } from 'next/server';
import { proxy } from '../proxy';
import { verifySession } from '@/lib/auth/session';

// Mock verifySession to avoid DB/Redis calls
jest.mock('@/lib/auth/session', () => ({
  verifySession: jest.fn(),
}));

// Helper to mock NextResponse
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

describe('Middleware - Bearer Token Auth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('blocks employee API without token or cookie', async () => {
    const req = new NextRequest(new URL('http://localhost/api/employee/shifts'));
    const response = await proxy(req);
    expect(response.status).toBe(401);
  });

  test('allows employee API with valid cookie', async () => {
    const req = new NextRequest(new URL('http://localhost/api/employee/shifts'));
    req.cookies.set('employee_token', 'valid-cookie-token');
    
    (verifySession as jest.Mock).mockResolvedValue({ isValid: true, userId: 'emp-1' });

    const response = await proxy(req);
    expect(response.status).toBe(200);
    expect(verifySession).toHaveBeenCalledWith('valid-cookie-token', 'employee');
  });

  test('allows employee API with valid Bearer token', async () => {
    const req = new NextRequest(new URL('http://localhost/api/employee/shifts'), {
      headers: { 'Authorization': 'Bearer valid-bearer-token' }
    });
    
    (verifySession as jest.Mock).mockResolvedValue({ isValid: true, userId: 'emp-1' });

    const response = await proxy(req);
    
    // THIS IS EXPECTED TO FAIL UNTIL IMPLEMENTED
    expect(response.status).toBe(200);
    expect(verifySession).toHaveBeenCalledWith('valid-bearer-token', 'employee');
  });

  test('blocks employee API with invalid Bearer token', async () => {
    const req = new NextRequest(new URL('http://localhost/api/employee/shifts'), {
      headers: { 'Authorization': 'Bearer invalid-bearer-token' }
    });
    
    (verifySession as jest.Mock).mockResolvedValue({ isValid: false });

    const response = await proxy(req);
    expect(response.status).toBe(401);
  });
});
