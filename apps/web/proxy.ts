import { NextResponse, NextRequest } from 'next/server';
import { verifySession } from '@/lib/auth/session';
import { AUTH_COOKIES } from '@/lib/auth/constants';
import { validateApiKeyInDb } from '@/lib/api-key';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Define protected paths
  const isAdminPath = pathname.startsWith('/admin');
  const isAdminApiPath = pathname.startsWith('/api/admin');
  const isLoginPage = pathname === '/admin/login' || pathname === '/admin/login/verify';
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

  // 3. Handle Admin Session Auth (for admin paths AND external docs)
  if (((isAdminPath || isAdminApiPath) && !isLoginPage) || isExternalDocsPath) {
    const token = request.cookies.get(AUTH_COOKIES.ADMIN)?.value;

    let isValid = false;

    if (token) {
      const { isValid: sessionValid } = await verifySession(token, 'admin');
      isValid = sessionValid;
    }

    if (!isValid) {
      // If it's an API request, return 401
      if (isAdminApiPath) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      // If it's a page request (admin page or external docs), redirect to login
      const loginUrl = new URL('/admin/login', request.url);

      const response = NextResponse.redirect(loginUrl);

      // Try to clear the invalid cookie
      response.cookies.delete(AUTH_COOKIES.ADMIN);

      return response;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*', '/api/external/:path*'],
};
