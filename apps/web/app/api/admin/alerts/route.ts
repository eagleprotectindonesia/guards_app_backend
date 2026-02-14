import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  // Note: Auth check (Admin access) is handled by proxy.ts

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get('page') || '1', 10);
  const perPage = parseInt(searchParams.get('per_page') || '10', 10);
  const skip = (page - 1) * perPage;

  try {
    const [total, alerts, groupedCounts] = await prisma.$transaction([
      prisma.alert.count(),
      prisma.alert.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: perPage,
        include: {
          site: true,
          resolverAdmin: true,
          ackAdmin: true,
          shift: {
            include: {
              employee: true,
              shiftType: true,
            },
          },
        },
      }),
      prisma.alert.groupBy({
        by: ['reason'],
        _count: {
          id: true,
        },
      }),
    ]);

    // Process counts into category buckets
    const counts = {
      attendance: 0,
      checkin: 0,
      security: 0,
    };

    groupedCounts.forEach(group => {
      const count = group._count.id;
      if (group.reason === 'missed_attendance') {
        counts.attendance += count;
      } else if (group.reason === 'missed_checkin') {
        counts.checkin += count;
      } else if (
        group.reason === 'geofence_breach' ||
        group.reason === 'location_services_disabled'
      ) {
        counts.security += count;
      }
    });

    return NextResponse.json({
      data: alerts,
      meta: {
        total,
        page,
        perPage,
        counts,
      },
    });
  } catch (error) {
    console.error('Error fetching alerts:', error);
    return NextResponse.json({ error: 'Failed to fetch alerts' }, { status: 500 });
  }
}
