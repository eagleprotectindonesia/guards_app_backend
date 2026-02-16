import { NextRequest, NextResponse } from 'next/server';
import { getAttendancesWithCheckins } from '@repo/database';

/**
 * GET /api/external/v1/attendance/by-employee
 * 
 * Get attendances with check-ins grouped by shift for a specific employee
 * 
 * Query Parameters:
 * - employeeId (required): The employee ID to filter by
 * - startDate (optional): Filter shifts starting from this date (ISO 8601 format)
 * - endDate (optional): Filter shifts starting before this date (ISO 8601 format)
 * 
 * Response Format:
 * {
 *   "data": [
 *     {
 *       "attendance": {
 *         "id": "uuid",
 *         "employeeId": "EMP001",
 *         "recordedAt": "2026-02-16T05:20:21.265Z",
 *         "status": "late",
 *         "metadata": { "location": { "lat": -8.6430162, "lng": 115.1977971 }, "latenessMins": 315 },
 *         "shift": {
 *           "date": "2026-02-15T00:00:00.000Z",
 *           "startsAt": "2026-02-16T00:00:00.000Z",
 *           "endsAt": "2026-02-16T08:00:00.000Z",
 *           "status": "completed",
 *           "missedCount": 1,
 *           "site": {
 *             "name": "Headquarters",
 *             "clientName": "Headquarters Owner",
 *             "address": "Jl. Umalas 1 Gg. XXII...",
 *             "latitude": -8.6695866,
 *             "longitude": 115.1538065
 *           },
 *           "shiftType": {
 *             "name": "Morning Shift"
 *           }
 *         }
 *       },
 *       "checkins": [
 *         {
 *           "id": "uuid",
 *           "employeeId": "EMP001",
 *           "at": "2026-02-16T05:20:25.268Z",
 *           "source": "web-ui",
 *           "status": "late",
 *           "metadata": { "lat": -8.6430162, "lng": 115.1977971, "latenessMins": 16 },
 *           "createdAt": "2026-02-16T05:20:25.278Z"
 *         }
 *       ]
 *     }
 *   ]
 * }
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // Required parameter
  const employeeId = searchParams.get('employeeId');
  
  if (!employeeId) {
    return NextResponse.json(
      { error: 'employeeId is required' },
      { status: 400 }
    );
  }

  // Optional date filters
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
    const { data } = await getAttendancesWithCheckins({
      employeeId,
      startDate,
      endDate,
    });

    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error fetching attendances with check-ins:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
