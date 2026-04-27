import { NextRequest, NextResponse } from 'next/server';
import { processGuardShiftBulkImport, prisma } from '@repo/database';
import { Prisma, ShiftStatus } from '@prisma/client';
import { parseISO, startOfDay, endOfDay, isValid } from 'date-fns';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const page = parseInt(searchParams.get('page') || '1');
  const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 100);
  const skip = (page - 1) * limit;

  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const siteId = searchParams.get('siteId');
  const employeeId = searchParams.get('employeeId');
  const status = searchParams.get('status');

  const where: Prisma.ShiftWhereInput = { deletedAt: null };

  if (startDate || endDate) {
    where.date = {};
    if (startDate) {
      const start = startOfDay(parseISO(startDate));
      if (isValid(start)) {
        where.date.gte = start;
      }
    }
    if (endDate) {
      const end = endOfDay(parseISO(endDate));
      if (isValid(end)) {
        where.date.lte = end;
      }
    }
  }

  if (siteId) where.siteId = siteId;
  if (employeeId) where.employeeId = employeeId;
  if (status) where.status = status as ShiftStatus;

  try {
    const [shifts, totalCount] = await Promise.all([
      prisma.shift.findMany({
        where,
        orderBy: { startsAt: 'desc' },
        skip,
        take: limit,
        include: {
          site: {
            select: { id: true, name: true },
          },
          employee: {
            select: { id: true, fullName: true },
          },
          shiftType: {
            select: { id: true, name: true, startTime: true, endTime: true },
          },
        },
      }),
      prisma.shift.count({ where }),
    ]);

    const safeShifts = shifts.map(shift => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { lastUpdatedById, createdById, deletedAt, ...safeShift } = shift;
      return safeShift;
    });

    return NextResponse.json({
      data: safeShifts,
      pagination: {
        total: totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching shifts for external API:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

type ParsedBulkRow = {
  rowNumber: number;
  site: string;
  shiftTypeName: string;
  date: string;
  employeeCode: string;
  interval: string;
  grace: string;
  note: string | null;
};

function parseCsvLine(line: string) {
  return line.split(',').map(value => value.trim().replace(/^"|"$/g, ''));
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '_');
}

const REQUIRED_HEADER_ALIASES: Record<string, string[]> = {
  site: ['site'],
  shift_type_name: ['shift_type_name'],
  date: ['date'],
  employee_code: ['employee_code'],
  interval: ['interval', 'required_check-in_interval_(minutes)', 'required_checkin_interval_(minutes)'],
  grace: ['grace', 'grace_minutes', 'grace_period_(minutes)'],
  note: ['note'],
};

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Missing file field.' }, { status: 400 });
    }

    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
    if (lines.length < 2) {
      return NextResponse.json({ error: 'CSV file is empty or missing data rows.' }, { status: 400 });
    }

    const header = parseCsvLine(lines[0]).map(normalizeHeader);
    const headerIndexByCanonical = new Map<string, number>();
    for (const [canonical, aliases] of Object.entries(REQUIRED_HEADER_ALIASES)) {
      const idx = header.findIndex(value => aliases.includes(value));
      if (idx >= 0) {
        headerIndexByCanonical.set(canonical, idx);
      }
    }

    const missingRequiredHeaders = ['site', 'shift_type_name', 'date', 'employee_code', 'interval', 'grace'].filter(
      key => !headerIndexByCanonical.has(key)
    );
    if (missingRequiredHeaders.length > 0) {
      return NextResponse.json(
        {
          error: `Invalid CSV header. Missing required column(s): ${missingRequiredHeaders.join(', ')}.`,
        },
        { status: 400 }
      );
    }

    const parsedRows: ParsedBulkRow[] = [];
    const rowErrors: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i]);
      const requiredIndexes = ['site', 'shift_type_name', 'date', 'employee_code', 'interval', 'grace'].map(
        key => headerIndexByCanonical.get(key) ?? -1
      );
      if (requiredIndexes.some(index => index < 0 || index >= cols.length)) {
        rowErrors.push(`Row ${i + 1}: missing required columns.`);
        continue;
      }

      const site = cols[headerIndexByCanonical.get('site')!];
      const shiftTypeName = cols[headerIndexByCanonical.get('shift_type_name')!];
      const date = cols[headerIndexByCanonical.get('date')!];
      const employeeCode = cols[headerIndexByCanonical.get('employee_code')!];
      const interval = cols[headerIndexByCanonical.get('interval')!];
      const grace = cols[headerIndexByCanonical.get('grace')!];
      const noteIndex = headerIndexByCanonical.get('note');
      const note = noteIndex != null && noteIndex < cols.length ? cols[noteIndex] : '';

      // Skip placeholder/empty employee rows from spreadsheet exports.
      if (!employeeCode || employeeCode.trim() === '' || employeeCode.trim().toUpperCase() === '#N/A') {
        continue;
      }

      if (!site || !shiftTypeName || !date || !employeeCode || !interval || !grace) {
        rowErrors.push(`Row ${i + 1}: site, shift_type_name, date, employee_code, interval, and grace are required.`);
        continue;
      }

      parsedRows.push({
        rowNumber: i + 1,
        site,
        shiftTypeName,
        date,
        employeeCode,
        interval,
        grace,
        note: note || null,
      });
    }

    if (rowErrors.length > 0) {
      return NextResponse.json({ error: 'Validation failed.', rowErrors }, { status: 400 });
    }

    const result = await processGuardShiftBulkImport(parsedRows);
    if (!result.success) {
      return NextResponse.json({ error: 'Validation failed.', rowErrors: result.errors }, { status: 400 });
    }

    return NextResponse.json({
      message: 'Bulk shift import processed.',
      summary: result.summary,
    });
  } catch (error) {
    console.error('Error processing external shift bulk import:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
