import { NextRequest, NextResponse } from 'next/server';
import { getPaginatedEmployees } from '@repo/database';
import { Prisma, EmployeeRole } from '@prisma/client';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // Pagination params
  const page = parseInt(searchParams.get('page') || '1');
  const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 100);
  const skip = (page - 1) * limit;

  // Filter params
  const status = searchParams.get('status');
  const departmentId = searchParams.get('departmentId');
  const designationId = searchParams.get('designationId');
  const officeId = searchParams.get('officeId');
  const role = searchParams.get('role');
  const search = searchParams.get('search');

  const where: Prisma.EmployeeWhereInput = {};

  if (status === 'true') where.status = true;
  if (status === 'false') where.status = false;
  if (departmentId) where.departmentId = departmentId;
  if (designationId) where.designationId = designationId;
  if (officeId) where.officeId = officeId;
  if (role) where.role = role as EmployeeRole;

  if (search) {
    where.OR = [
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
      { id: { contains: search, mode: 'insensitive' } },
      { employeeCode: { contains: search, mode: 'insensitive' } },
    ];
  }

  try {
    const { employees, totalCount } = await getPaginatedEmployees({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    });

    // Strip sensitive data
    const safeEmployees = employees.map(emp => {
      const { 
        hashedPassword: _hp, 
        tokenVersion: _tv, 
        lastUpdatedById: _lubi, 
        createdById: _cbi, 
        ...safeEmp 
      } = emp;
      return safeEmp;
    });

    return NextResponse.json({
      data: safeEmployees,
      pagination: {
        total: totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching employees for external API:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
