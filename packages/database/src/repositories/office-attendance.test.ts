import { Prisma } from '@prisma/client';
import { recordOfficeAttendance } from './office-attendance';
import { db as prisma } from '../prisma/client';

jest.mock('../prisma/client', () => ({
  db: {
    officeAttendance: {
      create: jest.fn(),
      findFirst: jest.fn(),
    },
  },
}));

describe('office attendance repository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('creates a new office attendance record when no conflict exists', async () => {
    (prisma.officeAttendance.create as jest.Mock).mockResolvedValue({
      id: 'attendance-1',
      officeShiftId: 'shift-1',
      status: 'present',
    });

    const result = await recordOfficeAttendance({
      officeId: 'office-1',
      officeShiftId: 'shift-1',
      employeeId: 'employee-1',
      status: 'present',
    });

    expect(result).toMatchObject({
      created: true,
      attendance: {
        id: 'attendance-1',
      },
    });
    expect(prisma.officeAttendance.findFirst).not.toHaveBeenCalled();
  });

  test('returns existing record when unique conflict happens for the same shift and status', async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '7.4.0',
    });

    (prisma.officeAttendance.create as jest.Mock).mockRejectedValue(conflict);
    (prisma.officeAttendance.findFirst as jest.Mock).mockResolvedValue({
      id: 'attendance-existing',
      officeShiftId: 'shift-1',
      status: 'present',
    });

    const result = await recordOfficeAttendance({
      officeId: 'office-1',
      officeShiftId: 'shift-1',
      employeeId: 'employee-1',
      status: 'present',
    });

    expect(prisma.officeAttendance.findFirst).toHaveBeenCalledWith({
      where: {
        officeShiftId: 'shift-1',
        status: 'present',
      },
      orderBy: {
        recordedAt: 'asc',
      },
    });
    expect(result).toMatchObject({
      created: false,
      attendance: {
        id: 'attendance-existing',
      },
    });
  });

  test('rethrows conflict when no existing record can be loaded', async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '7.4.0',
    });

    (prisma.officeAttendance.create as jest.Mock).mockRejectedValue(conflict);
    (prisma.officeAttendance.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(
      recordOfficeAttendance({
        officeId: 'office-1',
        officeShiftId: 'shift-1',
        employeeId: 'employee-1',
        status: 'present',
      })
    ).rejects.toThrow('Unique constraint failed');
  });
});
