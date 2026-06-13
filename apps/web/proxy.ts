import { NextResponse, NextRequest } from 'next/server';
import { verifySession } from '@/lib/auth/session';
import { AUTH_COOKIES, AUTH_COOKIE_SECURE } from '@/lib/auth/constants';
import { validateApiKeyInDb } from '@repo/database';
import { refreshEmployeeSession } from '@/lib/auth/session-helper';
import jwt from 'jsonwebtoken';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Define protected paths
  const isAdminPath = pathname.startsWith('/admin');
  const isAdminApiPath = pathname.startsWith('/api/admin');
  const isEmployeeApiPath = pathname.startsWith('/api/employee');
  const isSharedApiPath = pathname.startsWith('/api/shared');
  
  // Public paths within admin/employee/shared (e.g., login)
  const isPublicPath = 
    pathname === '/admin/login' || 
    pathname === '/admin/login/verify' ||
    pathname === '/api/admin/auth/login' ||
    pathname === '/api/admin/auth/verify-2fa' ||
    pathname === '/api/employee/auth/login' ||
    pathname === '/api/employee/auth/biometric/login';

  const isExternalApiPath = pathname.startsWith('/api/external/v1') && pathname !== '/api/external/v1/openapi.json';
  const isExternalDocsPath = pathname === '/api/external/docs';

  // 2. Handle External API Auth (API Key)
  if (isExternalApiPath) {
    const apiKey = request.headers.get('X-API-KEY');

    if (!apiKey) {
      return NextResponse.json({ error: 'Unauthorized: Missing API Key' }, { status: 401 });
    }

    const keyEntry = await validateApiKeyInDb(apiKey);

    if (!keyEntry) {
      return NextResponse.json({ error: 'Unauthorized: Invalid API Key' }, { status: 401 });
    }

    return NextResponse.next();
  }

  // 3. Handle Unified Auth for Shared API Routes
  if (isSharedApiPath) {
    const adminToken = request.cookies.get(AUTH_COOKIES.ADMIN)?.value;
    const employeeToken = request.cookies.get(AUTH_COOKIES.EMPLOYEE)?.value;

    let isAuthenticated = false;

    if (adminToken) {
      const { isValid } = await verifySession(adminToken, 'admin');
      if (isValid) isAuthenticated = true;
    }

    if (!isAuthenticated && employeeToken) {
      const { isValid } = await verifySession(employeeToken, 'employee');
      if (isValid) isAuthenticated = true;
    }

    if (!isAuthenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.next();
  }

  // 4. Handle Employee Session Auth
  let newToken: string | undefined;

  if (isEmployeeApiPath && !isPublicPath) {
    let token = request.cookies.get(AUTH_COOKIES.EMPLOYEE)?.value;
    
    // Fallback to Authorization Bearer header if cookie is missing
    if (!token) {
      const authHeader = request.headers.get('Authorization');
      if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
    }

    let isValid = false;

    if (token) {
      const { isValid: sessionValid, sessionId, exp, userId } = await verifySession(token, 'employee');
      isValid = sessionValid;

      if (isValid && sessionId && exp && userId) {
        const currentTimestampSec = Math.floor(Date.now() / 1000);
        const secondsRemaining = exp - currentTimestampSec;
        const twelveHoursSec = 12 * 60 * 60;

        if (secondsRemaining < twelveHoursSec) {
          try {
            const decodedToken = jwt.decode(token) as { clientType?: 'mobile' | 'pwa' };
            const clientType = decodedToken?.clientType || 'mobile';

            newToken = await refreshEmployeeSession(sessionId, userId, clientType);
          } catch (error) {
            console.error('Failed to refresh employee session:', error);
          }
        }
      }
    }

    if (!isValid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  // 5. Handle Admin Session Auth (for admin paths AND external docs)
  if (((isAdminPath || isAdminApiPath) && !isPublicPath) || isExternalDocsPath) {
    const token = request.cookies.get(AUTH_COOKIES.ADMIN)?.value;

    let isValid = false;
    let sessionReason: string | undefined;

    if (token) {
      const { isValid: sessionValid, reason } = await verifySession(token, 'admin');
      isValid = sessionValid;
      sessionReason = reason;
    }

    if (!isValid) {
      const isTransientVerificationFailure = sessionReason === 'backend_error';

      // If it's an API request, return 401
      if (isAdminApiPath) {
        if (isTransientVerificationFailure) {
          return NextResponse.json({ error: 'Service Unavailable' }, { status: 503 });
        }
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      if (isTransientVerificationFailure) {
        return NextResponse.next();
      }

      // If it's a page request (admin page or external docs), redirect to login
      const loginUrl = new URL('/admin/login', request.url);

      const response = NextResponse.redirect(loginUrl);

      // Try to clear the invalid cookie
      response.cookies.delete(AUTH_COOKIES.ADMIN);

      return response;
    }
  }

  const response = NextResponse.next();
  if (newToken) {
    response.headers.set('x-new-token', newToken);
    response.cookies.set(AUTH_COOKIES.EMPLOYEE, newToken, {
      httpOnly: true,
      secure: AUTH_COOKIE_SECURE,
      maxAge: 60 * 60 * 24,
      path: '/',
    });
  }
  return response;
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/api/admin/:path*',
    '/api/employee/:path*',
    '/api/shared/:path*',
    '/api/external/:path*',
  ],
};
