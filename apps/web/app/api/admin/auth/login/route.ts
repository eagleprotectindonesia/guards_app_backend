import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { findAdminByEmail } from '@repo/database';
import { AUTH_COOKIES, AUTH_COOKIE_SECURE, getJwtSecret } from '@/lib/auth/constants';
import { verifyPassword } from '@repo/database';
import { redis } from '@repo/database/redis';
import { checkLoginThrottle, recordLoginFailure, clearLoginFailures, clientIp, RateLimitBackendError } from '@repo/auth-server';

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return new NextResponse(JSON.stringify({ error: 'Email and password are required' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }

    const ip = clientIp(req);
    const accountKey = email.toLowerCase();

    const throttle = await checkLoginThrottle({ accountKey, ip });
    if (!throttle.allowed) {
      return new NextResponse(JSON.stringify({ error: 'Too many attempts. Please try again later.' }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(throttle.retryAfter ?? 900),
        },
      });
    }

    // Find admin by email
    const admin = await findAdminByEmail(email);

    if (!admin || !admin.hashedPassword) {
      await recordLoginFailure({ accountKey, ip });
      return new NextResponse(JSON.stringify({ error: 'Invalid credentials' }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }

    // Compare passwords
    const passwordMatch = await verifyPassword(password, admin.hashedPassword);

    if (!passwordMatch) {
      await recordLoginFailure({ accountKey, ip });
      return new NextResponse(JSON.stringify({ error: 'Invalid credentials' }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }

    await clearLoginFailures({ accountKey, ip });

    // Check if 2FA is enabled
    if (admin.twoFactorEnabled) {
      const response = new NextResponse(JSON.stringify({ 
        message: '2FA required',
        requires2FA: true 
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Set a short-lived temporary token for 2FA verification
      const tempToken = jwt.sign(
        { adminId: admin.id, pending2FA: true }, 
        getJwtSecret(), 
        { expiresIn: '5m' }
      );

      response.cookies.set(AUTH_COOKIES.ADMIN_2FA_PENDING, tempToken, {
        httpOnly: true,
        secure: AUTH_COOKIE_SECURE,
        maxAge: 300, // 5 minutes
        path: '/',
      });

      return response;
    }

    // Cache token version in Redis
    const cacheKey = `admin:token_version:${admin.id}`;
    await redis.set(cacheKey, admin.tokenVersion.toString(), 'EX', 3600); // 1 hour

    // Generate JWT token
    const token = jwt.sign(
      { adminId: admin.id, email: admin.email, tokenVersion: admin.tokenVersion },
      getJwtSecret(),
      { expiresIn: '30d' }
    );

    // Set the token as an HTTP-only cookie
    const response = new NextResponse(JSON.stringify({ message: 'Login successful' }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
    response.cookies.set(AUTH_COOKIES.ADMIN, token, {
      httpOnly: true,
      secure: AUTH_COOKIE_SECURE,
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Login error:', error);
    if (error instanceof RateLimitBackendError) {
      return new NextResponse(JSON.stringify({ error: 'Service unavailable. Please try again.' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new NextResponse(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
}
