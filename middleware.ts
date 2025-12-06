import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // 1. Guard Authentication Logic
  if (request.nextUrl.pathname.startsWith('/guard')) {
    // Exclude login page and static assets/api if needed (though API is handled separately usually)
    if (request.nextUrl.pathname === '/guard/login') {
      return NextResponse.next();
    }

    const token = request.cookies.get('guard_token');

    if (!token) {
      const loginUrl = new URL('/guard/login', request.url);
      // Optional: Add a 'from' query param to redirect back after login
      // loginUrl.searchParams.set('from', request.nextUrl.pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/guard/:path*',
  ],
};
