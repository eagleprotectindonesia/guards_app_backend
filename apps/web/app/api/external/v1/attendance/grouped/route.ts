import { NextRequest, NextResponse } from 'next/server';
import { getAttendancesWithCheckins } from '@repo/database';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // Pagination params
  const page = parseInt(searchParams.get('page') || '1');
  const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 100);
  const skip = (page - 1) * limit;

  // Optional filters
  const employeeId = searchParams.get('employeeId') || undefined;
  const startDateParam = searchParams.get('startDate');
  const endDateParam = searchParams.get('endDate');

  let startDate: Date | undefined;
  let endDate: Date | undefined;

  if (startDateParam) {
    startDate = new Date(startDateParam);
    if (isNaN(startDate.getTime())) {
      return NextResponse.json(
        { error: 'Invalid startDate format. Use ISO 8601 format.' },
        { status: 400 }
      );
    }
  }

  if (endDateParam) {
    endDate = new Date(endDateParam);
    if (isNaN(endDate.getTime())) {
      return NextResponse.json(
        { error: 'Invalid endDate format. Use ISO 8601 format.' },
        { status: 400 }
      );
    }
  }

  try {
    const { data, totalCount } = await getAttendancesWithCheckins({
      employeeId,
      startDate,
      endDate,
      skip,
      take: limit,
    });

    return NextResponse.json({
      data,
      pagination: {
        total: totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching grouped attendances:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
