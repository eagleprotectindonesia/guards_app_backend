import { NextRequest, NextResponse } from 'next/server';
import { getPaginatedDesignations } from '@repo/database';
import { Prisma, EmployeeRole } from '@prisma/client';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // Pagination params
  const page = parseInt(searchParams.get('page') || '1');
  const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 100);
  const skip = (page - 1) * limit;

  // Filter params
  const departmentId = searchParams.get('departmentId');
  const role = searchParams.get('role');
  const search = searchParams.get('search');

  const where: Prisma.DesignationWhereInput = {};

  if (departmentId) where.departmentId = departmentId;
  if (role) where.role = role as EmployeeRole;

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { id: { contains: search, mode: 'insensitive' } },
    ];
  }

  try {
    const { designations, totalCount } = await getPaginatedDesignations({
      where,
      orderBy: { name: 'asc' },
      skip,
      take: limit,
    });

    return NextResponse.json({
      data: designations,
      pagination: {
        total: totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching designations for external API:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
