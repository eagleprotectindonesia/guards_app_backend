import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';
import { getAdminIdFromToken } from '@/lib/admin-auth';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const adminId = await getAdminIdFromToken();

  if (!adminId) {
      return NextResponse.json({ error: 'Unauthorized: No admin found' }, { status: 401 });
  }

  try {
    const alert = await prisma.alert.update({
      where: { id },
      data: {
        acknowledgedAt: new Date(),
        acknowledgedById: adminId,
      },
      include: {
        site: true,
        resolverAdmin: true,
        ackAdmin: true,
        shift: {
          include: {
            guard: true,
            shiftType: true,
          },
        },
      },
    });

    // Publish update
    const payload = {
      type: 'alert_updated',
      alert,
    };
    await redis.publish(`alerts:site:${alert.siteId}`, JSON.stringify(payload));

    return NextResponse.json(alert);
  } catch (error) {
    console.error('Error acknowledging alert:', error);
    return NextResponse.json({ error: 'Error acknowledging alert' }, { status: 500 });
  }
}
