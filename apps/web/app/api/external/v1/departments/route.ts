import { NextRequest, NextResponse } from 'next/server';
import { getPaginatedDepartments } from '@repo/database';
import { Prisma } from '@prisma/client';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // Pagination params
  const page = parseInt(searchParams.get('page') || '1');
  const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 100);
  const skip = (page - 1) * limit;

  // Filter params
  const search = searchParams.get('search');

  const where: Prisma.DepartmentWhereInput = {};

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { id: { contains: search, mode: 'insensitive' } },
    ];
  }

  try {
    const { departments, totalCount } = await getPaginatedDepartments({
      where,
      orderBy: { name: 'asc' },
      skip,
      take: limit,
    });

    return NextResponse.json({
      data: departments,
      pagination: {
        total: totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching departments for external API:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
