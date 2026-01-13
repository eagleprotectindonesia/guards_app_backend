import { NextResponse, NextRequest } from 'next/server';
import { verifySession } from '@/lib/auth/session';
import { AUTH_COOKIES } from '@/lib/auth/constants';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Define protected paths
  const isAdminPath = pathname.startsWith('/admin');
  const isAdminApiPath = pathname.startsWith('/api/admin');
  const isLoginPage = pathname === '/admin/login';

  // 2. Only check if it's an admin path and NOT the login page
  if ((isAdminPath || isAdminApiPath) && !isLoginPage) {
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

      // If it's a page request, redirect to login
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
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};
