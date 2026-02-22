import { NextRequest, NextResponse } from 'next/server';
import { getAttendancesWithCheckins } from '@repo/database';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // Optional filters
  const employeeId = searchParams.get('employee_id') || undefined;
  const startDateParam = searchParams.get('start_date');
  const endDateParam = searchParams.get('end_date');

  let endDate: Date;
  if (endDateParam) {
    endDate = new Date(endDateParam);
    if (isNaN(endDate.getTime())) {
      return NextResponse.json({ error: 'Invalid end_date format. Use ISO 8601 format.' }, { status: 400 });
    }
  } else {
    endDate = new Date();
  }

  let startDate: Date;
  if (startDateParam) {
    startDate = new Date(startDateParam);
    if (isNaN(startDate.getTime())) {
      return NextResponse.json({ error: 'Invalid start_date format. Use ISO 8601 format.' }, { status: 400 });
    }
  } else {
    startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 7);
  }

  if (!employeeId) {
    const maxRangeMs = 7 * 24 * 60 * 60 * 1000;
    if (endDate.getTime() - startDate.getTime() > maxRangeMs) {
      return NextResponse.json(
        { error: 'Date range cannot exceed 1 week when not querying a specific employee.' },
        { status: 400 }
      );
    }
  }

  if (startDate.getTime() > endDate.getTime()) {
    return NextResponse.json({ error: 'start_date cannot be after end_date.' }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Accumulate grouped data across all paginated chunks
        const grouped: Record<string, unknown[]> = {};

        let skip = 0;
        const take = 50;

        while (true) {
          const { data } = await getAttendancesWithCheckins({
            employeeId,
            startDate,
            endDate,
            skip,
            take,
          });

          // Merge new chunk into grouped accumulator
          for (const [empId, records] of Object.entries(data)) {
            if (!grouped[empId]) grouped[empId] = [];
            grouped[empId].push(...records);
          }

          const chunkSize = Object.values(data).reduce((sum, arr) => sum + arr.length, 0);
          if (chunkSize < take) {
            break; // Last page reached
          }

          skip += take;
        }

        // Stream the grouped result as a JSON object, one employee key at a time
        controller.enqueue(encoder.encode('{\n"data": {\n'));

        const keys = Object.keys(grouped);
        for (let i = 0; i < keys.length; i++) {
          const key = keys[i];
          const records = grouped[key];
          controller.enqueue(encoder.encode(`${JSON.stringify(key)}: ${JSON.stringify(records)}`));
          if (i < keys.length - 1) {
            controller.enqueue(encoder.encode(',\n'));
          }
        }

        controller.enqueue(encoder.encode('\n}\n}'));
        controller.close();
      } catch (error) {
        console.error('Error streaming grouped attendances:', error);
        controller.error(error);
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
    },
  });
}
