import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';
import { redis } from '@/lib/redis';
import { getAdminById } from '@/lib/data-access/admins';
import { verify2FAToken } from '@/lib/auth/2fa';
import { AUTH_COOKIES, JWT_SECRET } from '@/lib/auth/constants';

export async function POST(req: Request) {
  try {
    const { code } = await req.json();

    if (!code) {
      return new NextResponse(JSON.stringify({ error: 'Verification code is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 1. Get and verify the pending 2FA token
    const cookieStore = await cookies();
    const pendingToken = cookieStore.get(AUTH_COOKIES.ADMIN_2FA_PENDING)?.value;

    if (!pendingToken) {
      return new NextResponse(JSON.stringify({ error: 'Session expired. Please login again.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let adminId: string;
    try {
      const decoded = jwt.verify(pendingToken, JWT_SECRET) as { adminId: string; pending2FA: boolean };
      if (!decoded.pending2FA) throw new Error('Invalid token type');
      adminId = decoded.adminId;
    } catch {
      return new NextResponse(JSON.stringify({ error: 'Invalid or expired 2FA session' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2. Fetch admin to get the secret
    const admin = await getAdminById(adminId);

    if (!admin || !admin.twoFactorSecret || !admin.twoFactorEnabled) {
      return new NextResponse(JSON.stringify({ error: '2FA is not enabled for this account' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 3. Verify the 6-digit code
    const isValid = await verify2FAToken(code, admin.twoFactorSecret);

    if (!isValid) {
      return new NextResponse(JSON.stringify({ error: 'Invalid verification code' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 4. Verification successful - Issue the final admin_token
    const cacheKey = `admin:token_version:${admin.id}`;
    await redis.set(cacheKey, admin.tokenVersion.toString(), 'EX', 3600);

    const token = jwt.sign(
      { adminId: admin.id, email: admin.email, tokenVersion: admin.tokenVersion }, 
      JWT_SECRET, 
      { expiresIn: '30d' }
    );

    const response = new NextResponse(JSON.stringify({ message: 'Login successful' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

    // Set the final token
    response.cookies.set(AUTH_COOKIES.ADMIN, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 30 * 24 * 60 * 60,
      path: '/',
    });

    // Clear the pending 2FA cookie
    response.cookies.delete(AUTH_COOKIES.ADMIN_2FA_PENDING);

    return response;
  } catch (error) {
    console.error('2FA Verification error:', error);
    return new NextResponse(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
