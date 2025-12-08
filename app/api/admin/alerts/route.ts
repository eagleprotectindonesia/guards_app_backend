import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  // TODO: Auth check (Admin access)

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get('page') || '1', 10);
  const perPage = parseInt(searchParams.get('per_page') || '10', 10);
  const skip = (page - 1) * perPage;

  try {
    const [total, alerts] = await prisma.$transaction([
      prisma.alert.count(),
      prisma.alert.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: perPage,
        include: {
          site: true,
          resolverAdmin: true,
          shift: {
            include: {
              guard: true,
              shiftType: true,
            },
          },
        },
      }),
    ]);

    return NextResponse.json({
      data: alerts,
      meta: {
        total,
        page,
        perPage,
      },
    });
  } catch (error) {
    console.error('Error fetching alerts:', error);
    return NextResponse.json({ error: 'Failed to fetch alerts' }, { status: 500 });
  }
}
