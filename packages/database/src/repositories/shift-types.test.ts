import { Prisma } from '@prisma/client';
import { createShiftTypeWithChangelog, getShiftTypeDurationInMins, updateShiftTypeWithChangelog } from './shift-types';
import { db as prisma } from '../prisma/client';

jest.mock('../prisma/client', () => ({
  db: {
    shiftType: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    changelog: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

describe('shift types repository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.$transaction as jest.Mock).mockImplementation(async callback => callback(prisma));
    (prisma.changelog.create as jest.Mock).mockResolvedValue({});
  });

  test('creates a new active shift type after a soft-deleted name is reused', async () => {
    const createdShiftType = {
      id: 'shift-type-2',
      name: 'Morning',
      startTime: '08:00',
      endTime: '16:00',
    };

    (prisma.shiftType.create as jest.Mock).mockResolvedValue(createdShiftType);

    const result = await createShiftTypeWithChangelog(
      { name: 'Morning', startTime: '08:00', endTime: '16:00' },
      'admin-1'
    );

    expect(prisma.shiftType.create).toHaveBeenCalledWith({
      data: {
        name: 'Morning',
        startTime: '08:00',
        endTime: '16:00',
        lastUpdatedBy: { connect: { id: 'admin-1' } },
        createdBy: { connect: { id: 'admin-1' } },
      },
    });
    expect(result).toEqual(createdShiftType);
  });

  test('returns a friendly error when creating a duplicate active shift type name', async () => {
    const error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '7.4.2',
      meta: {
        target: ['name'],
      },
    });

    (prisma.shiftType.create as jest.Mock).mockRejectedValue(error);

    await expect(
      createShiftTypeWithChangelog({ name: 'Morning', startTime: '08:00', endTime: '16:00' }, 'admin-1')
    ).rejects.toThrow('A Shift Type with this name already exists. Please use a different name.');
  });

  test('allows renaming to a name used only by a deleted shift type', async () => {
    (prisma.shiftType.findUnique as jest.Mock).mockResolvedValue({
      id: 'shift-type-1',
      name: 'Evening',
      startTime: '16:00',
      endTime: '00:00',
    });
    (prisma.shiftType.update as jest.Mock).mockResolvedValue({
      id: 'shift-type-1',
      name: 'Morning',
      startTime: '16:00',
      endTime: '00:00',
    });

    const result = await updateShiftTypeWithChangelog('shift-type-1', { name: 'Morning' }, 'admin-1');

    expect(prisma.shiftType.update).toHaveBeenCalledWith({
      where: { id: 'shift-type-1' },
      data: {
        name: 'Morning',
        lastUpdatedBy: { connect: { id: 'admin-1' } },
      },
    });
    expect(result.updatedShiftType.name).toBe('Morning');
  });

  test('returns a friendly error when renaming to a name used by another active shift type', async () => {
    const error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '7.4.2',
      meta: {
        target: ['name'],
      },
    });

    (prisma.shiftType.findUnique as jest.Mock).mockResolvedValue({
      id: 'shift-type-1',
      name: 'Evening',
      startTime: '16:00',
      endTime: '00:00',
    });
    (prisma.shiftType.update as jest.Mock).mockRejectedValue(error);

    await expect(updateShiftTypeWithChangelog('shift-type-1', { name: 'Morning' }, 'admin-1')).rejects.toThrow(
      'A Shift Type with this name already exists. Please use a different name.'
    );
  });
});

describe('getShiftTypeDurationInMins', () => {
  test('calculates duration for end time 24:00', () => {
    expect(getShiftTypeDurationInMins('16:00', '24:00')).toBe(480);
  });

  test('calculates overnight duration when start is 24:00', () => {
    expect(getShiftTypeDurationInMins('24:00', '06:00')).toBe(360);
  });

  test('calculates duration for regular overnight shifts', () => {
    expect(getShiftTypeDurationInMins('22:00', '06:00')).toBe(480);
  });
});
