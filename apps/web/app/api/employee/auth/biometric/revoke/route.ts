import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const revokeSchema = z.object({
  biometricToken: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { biometricToken } = revokeSchema.parse(body);

    const hashedToken = crypto.createHash('sha256').update(biometricToken).digest('hex');

    await prisma.refreshToken.updateMany({
      where: { token: hashedToken },
      data: { revokedAt: new Date() },
    });

    return NextResponse.json({ message: 'Biometric disabled' });

  } catch (error) {
    console.error('Biometric revoke error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
