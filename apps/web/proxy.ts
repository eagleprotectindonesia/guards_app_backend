import { NextResponse, NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';
import { redis } from '@/lib/redis';
import { getAdminById } from '@/lib/data-access/admins';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Define protected paths
  const isAdminPath = pathname.startsWith('/admin');
  const isAdminApiPath = pathname.startsWith('/api/admin');
  const isLoginPage = pathname === '/admin/login';

  // 2. Only check if it's an admin path and NOT the login page
  if ((isAdminPath || isAdminApiPath) && !isLoginPage) {
    const token = request.cookies.get('admin_token')?.value;

    let isValid = false;

    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as { adminId: string; tokenVersion?: number };
        
        // 1. Check Redis Cache first
        const cacheKey = `admin:token_version:${decoded.adminId}`;
        let currentVersion: number | null = null;
        
        const cachedVersion = await redis.get(cacheKey);
        if (cachedVersion !== null) {
          currentVersion = parseInt(cachedVersion, 10);
        } else {
          // 2. Fallback to Database
          const admin = await getAdminById(decoded.adminId);
          
          if (admin) {
            currentVersion = admin.tokenVersion;
            // Cache for 1 hour
            await redis.set(cacheKey, currentVersion.toString(), 'EX', 3600);
          }
        }

        if (currentVersion !== null && (decoded.tokenVersion === undefined || decoded.tokenVersion === currentVersion)) {
          isValid = true;
        }
      } catch (err) {
        console.warn('Proxy: Admin token verification failed:', err);
      }
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
      response.cookies.delete('admin_token');
      
      return response;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/api/admin/:path*',
  ],
};
