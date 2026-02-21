import { NextRequest, NextResponse } from 'next/server';
import { getAttendancesWithCheckins } from '@repo/database';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // Optional filters
  const employeeId = searchParams.get('employeeId') || undefined;
  const startDateParam = searchParams.get('startDate');
  const endDateParam = searchParams.get('endDate');

  let endDate: Date;
  if (endDateParam) {
    endDate = new Date(endDateParam);
    if (isNaN(endDate.getTime())) {
      return NextResponse.json({ error: 'Invalid endDate format. Use ISO 8601 format.' }, { status: 400 });
    }
  } else {
    endDate = new Date();
  }

  let startDate: Date;
  if (startDateParam) {
    startDate = new Date(startDateParam);
    if (isNaN(startDate.getTime())) {
      return NextResponse.json({ error: 'Invalid startDate format. Use ISO 8601 format.' }, { status: 400 });
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
    return NextResponse.json({ error: 'startDate cannot be after endDate.' }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Start the JSON response with the `data` array
        controller.enqueue(encoder.encode('{\n"data": [\n'));

        let skip = 0;
        const take = 20;
        let isFirstChunk = true;

        while (true) {
          const { data } = await getAttendancesWithCheckins({
            employeeId,
            startDate,
            endDate,
            skip,
            take,
          });

          if (data.length === 0) {
            break; // No more data to fetch
          }

          // Write each item to the stream
          for (const item of data) {
            if (!isFirstChunk) {
              controller.enqueue(encoder.encode(',\n'));
            }
            controller.enqueue(encoder.encode(JSON.stringify(item)));
            isFirstChunk = false;
          }

          skip += take;
        }

        // Close the JSON array and object
        controller.enqueue(encoder.encode('\n]\n}'));
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
