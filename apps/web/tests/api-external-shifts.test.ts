import { GET, POST } from '../app/api/external/v1/shifts/route';
import { prisma } from '@repo/database';
import { NextRequest } from 'next/server';

jest.mock('@repo/database', () => ({
  processGuardShiftBulkImport: jest.fn(),
  prisma: {
    shift: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
}));

describe('/api/external/v1/shifts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns paginated shifts', async () => {
    const mockShifts = [
      { id: 'shift-1', status: 'scheduled' },
      { id: 'shift-2', status: 'in_progress' },
    ];
    (prisma.shift.findMany as jest.Mock).mockResolvedValue(mockShifts);
    (prisma.shift.count as jest.Mock).mockResolvedValue(2);

    const req = new NextRequest(new URL('http://localhost/api/external/v1/shifts?page=1&limit=5'));
    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data).toHaveLength(2);
    expect(prisma.shift.findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 0,
      take: 5,
    }));
  });

  test('applies date range filters', async () => {
    (prisma.shift.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.shift.count as jest.Mock).mockResolvedValue(0);

    const startDate = '2026-01-01';
    const endDate = '2026-01-31';
    const req = new NextRequest(new URL(`http://localhost/api/external/v1/shifts?startDate=${startDate}&endDate=${endDate}`));
    await GET(req);

    expect(prisma.shift.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        date: {
          gte: expect.any(Date),
          lte: expect.any(Date),
        },
      }),
    }));
  });

  test('bulk upserts by employee+date and handles OFF deletes', async () => {
    const { processGuardShiftBulkImport } = jest.requireMock('@repo/database');
    (processGuardShiftBulkImport as jest.Mock).mockResolvedValue({
      success: true,
      errors: [],
      summary: {
        rows_processed: 3,
        rows_failed: 0,
        created: 1,
        updated: 1,
        deleted_off: 1,
        past_dates_skipped: 0,
      },
    });

    const csv = [
      'Employee_Code,Shift_Type_Name,Date,Note,Site,Interval,Grace Minutes,,DEFAULT SHIFT,OVERRIDE FLAG,AUDIT MESSAGE',
      'EP0056,Morning,2026-05-01,,HQ,30,5,,Morning,NO,',
      'EP0056,OFF,2026-05-03,,HQ,30,5,,OFF,NO,',
      'EP0056,Morning,2026-05-04,,HQ,30,5,,Morning,NO,',
    ].join('\n');

    const formData = new FormData();
    formData.set('file', new File([csv], 'bulk.csv', { type: 'text/csv' }));

    const req = { formData: async () => formData } as unknown as NextRequest;
    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(processGuardShiftBulkImport).toHaveBeenCalledTimes(1);
    expect(data.summary).toEqual(
      expect.objectContaining({
        created: 1,
        updated: 1,
        deleted_off: 1,
      })
    );
  });

  test('skips past dates in bulk import', async () => {
    const { processGuardShiftBulkImport } = jest.requireMock('@repo/database');
    (processGuardShiftBulkImport as jest.Mock).mockResolvedValue({
      success: true,
      errors: [],
      summary: {
        rows_processed: 0,
        rows_failed: 0,
        created: 0,
        updated: 0,
        deleted_off: 0,
        past_dates_skipped: 1,
      },
    });

    const csv = ['Employee_Code,Shift_Type_Name,Date,Note,Site,Interval,Grace Minutes', 'EP0056,Morning,2020-01-01,,HQ,30,5'].join('\n');
    const formData = new FormData();
    formData.set('file', new File([csv], 'bulk.csv', { type: 'text/csv' }));

    const req = { formData: async () => formData } as unknown as NextRequest;
    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.summary.past_dates_skipped).toBe(1);
  });

  test('returns 400 when delegated validation fails', async () => {
    const { processGuardShiftBulkImport } = jest.requireMock('@repo/database');
    (processGuardShiftBulkImport as jest.Mock).mockResolvedValue({
      success: false,
      errors: ['Row 2: invalid date.'],
      summary: {
        rows_processed: 0,
        rows_failed: 1,
        created: 0,
        updated: 0,
        deleted_off: 0,
        past_dates_skipped: 0,
      },
    });

    const csv = ['Employee_Code,Shift_Type_Name,Date,Note,Site,Interval,Grace Minutes', 'EP0056,Morning,bad-date,,HQ,30,5'].join('\n');
    const formData = new FormData();
    formData.set('file', new File([csv], 'bulk.csv', { type: 'text/csv' }));
    const req = { formData: async () => formData } as unknown as NextRequest;
    const response = await POST(req);

    expect(response.status).toBe(400);
  });

  test('ignores rows with empty or #N/A employee code', async () => {
    const { processGuardShiftBulkImport } = jest.requireMock('@repo/database');
    (processGuardShiftBulkImport as jest.Mock).mockResolvedValue({
      success: true,
      errors: [],
      summary: {
        rows_processed: 1,
        rows_failed: 0,
        created: 1,
        updated: 0,
        deleted_off: 0,
        past_dates_skipped: 0,
      },
    });

    const csv = [
      'Employee_Code,Shift_Type_Name,Date,Note,Site,Interval,Grace Minutes',
      ',Morning,2026-05-01,,HQ,30,5',
      '#N/A,Morning,2026-05-02,,HQ,30,5',
      'EP0056,Morning,2026-05-03,,HQ,30,5',
    ].join('\n');

    const formData = new FormData();
    formData.set('file', new File([csv], 'bulk.csv', { type: 'text/csv' }));
    const req = { formData: async () => formData } as unknown as NextRequest;
    const response = await POST(req);

    expect(response.status).toBe(200);
    expect(processGuardShiftBulkImport).toHaveBeenCalledWith([
      expect.objectContaining({
        employeeCode: 'EP0056',
      }),
    ]);
  });
});
