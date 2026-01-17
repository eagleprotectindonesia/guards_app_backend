import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const page = parseInt(searchParams.get('page') || '1');
  const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 100);
  const skip = (page - 1) * limit;

  const status = searchParams.get('status');
  const search = searchParams.get('search');

  const where: Prisma.SiteWhereInput = { deletedAt: null };

  if (status === 'true') where.status = true;
  if (status === 'false') where.status = false;

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { clientName: { contains: search, mode: 'insensitive' } },
      { address: { contains: search, mode: 'insensitive' } },
    ];
  }

  try {
    const [sites, totalCount] = await Promise.all([
      prisma.site.findMany({
        where,
        orderBy: { name: 'asc' },
        skip,
        take: limit,
      }),
      prisma.site.count({ where }),
    ]);

    const safeSites = sites.map(site => {
      const { lastUpdatedById: _lubi, createdById: _cbi, ...safeSite } = site;
      return safeSite;
    });

    return NextResponse.json({
      data: safeSites,
      pagination: {
        total: totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching sites for external API:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
