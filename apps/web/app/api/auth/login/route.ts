import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { redis } from '@/lib/redis';
import { findAdminByEmail } from '@/lib/data-access/admins';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey'; // Replace with a strong, random key in production

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

    // Find admin by email
    const admin = await findAdminByEmail(email);

    if (!admin || !admin.hashedPassword) {
      return new NextResponse(JSON.stringify({ error: 'Invalid credentials' }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }

    // Compare passwords
    const passwordMatch = await bcrypt.compare(password, admin.hashedPassword);

    if (!passwordMatch) {
      return new NextResponse(JSON.stringify({ error: 'Invalid credentials' }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }

    // Cache token version in Redis
    const cacheKey = `admin:token_version:${admin.id}`;
    await redis.set(cacheKey, admin.tokenVersion.toString(), 'EX', 3600); // 1 hour

    // Generate JWT token
    const token = jwt.sign({ adminId: admin.id, email: admin.email, tokenVersion: admin.tokenVersion }, JWT_SECRET, { expiresIn: '30d' });

    // Set the token as an HTTP-only cookie
    const response = new NextResponse(JSON.stringify({ message: 'Login successful' }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
    response.cookies.set('admin_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Login error:', error);
    return new NextResponse(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
}
