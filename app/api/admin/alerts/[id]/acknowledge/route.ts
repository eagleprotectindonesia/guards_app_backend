import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  // TODO: Auth Check (ensure admin role)
  const { id } = await params;
  const adminId = 'mock-admin-id'; // TODO: Replace with real Admin Auth ID

  try {
    const alert = await prisma.alert.update({
      where: { id },
      data: {
        acknowledgedAt: new Date(),
        acknowledgedById: adminId, // Use acknowledgedById
      },
      include: { shift: true }, // Include shift to get necessary data for SSE payload
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
