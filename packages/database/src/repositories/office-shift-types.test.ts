import { Prisma } from '@prisma/client';
import {
  createOfficeShiftTypeWithChangelog,
  updateOfficeShiftTypeWithChangelog,
} from './office-shift-types';
import { db as prisma } from '../prisma/client';

jest.mock('../prisma/client', () => ({
  db: {
    officeShiftType: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    changelog: {
      create: jest.fn(),
    },
    officeShift: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock('./office-shifts', () => ({
  deleteOfficeShiftWithChangelog: jest.fn(),
}));

describe('office shift types repository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.$transaction as jest.Mock).mockImplementation(async callback => callback(prisma));
    (prisma.changelog.create as jest.Mock).mockResolvedValue({});
  });

  test('creates a new active office shift type after a soft-deleted name is reused', async () => {
    const createdOfficeShiftType = {
      id: 'office-shift-type-2',
      name: 'Morning',
      startTime: '08:00',
      endTime: '16:00',
    };

    (prisma.officeShiftType.create as jest.Mock).mockResolvedValue(createdOfficeShiftType);

    const result = await createOfficeShiftTypeWithChangelog(
      { name: 'Morning', startTime: '08:00', endTime: '16:00' },
      'admin-1'
    );

    expect(prisma.officeShiftType.create).toHaveBeenCalledWith({
      data: {
        name: 'Morning',
        startTime: '08:00',
        endTime: '16:00',
        createdBy: { connect: { id: 'admin-1' } },
        lastUpdatedBy: { connect: { id: 'admin-1' } },
      },
    });
    expect(result).toEqual(createdOfficeShiftType);
  });

  test('returns a friendly error when creating a duplicate active office shift type name', async () => {
    const error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '7.4.2',
      meta: {
        target: ['name'],
      },
    });

    (prisma.officeShiftType.create as jest.Mock).mockRejectedValue(error);

    await expect(
      createOfficeShiftTypeWithChangelog({ name: 'Morning', startTime: '08:00', endTime: '16:00' }, 'admin-1')
    ).rejects.toThrow('A Office Shift Type with this name already exists. Please use a different name.');
  });

  test('allows renaming to a name used only by a deleted office shift type', async () => {
    (prisma.officeShiftType.findUnique as jest.Mock).mockResolvedValue({
      id: 'office-shift-type-1',
      name: 'Evening',
      startTime: '16:00',
      endTime: '00:00',
    });
    (prisma.officeShiftType.update as jest.Mock).mockResolvedValue({
      id: 'office-shift-type-1',
      name: 'Morning',
      startTime: '16:00',
      endTime: '00:00',
    });

    const result = await updateOfficeShiftTypeWithChangelog('office-shift-type-1', { name: 'Morning' }, 'admin-1');

    expect(prisma.officeShiftType.update).toHaveBeenCalledWith({
      where: { id: 'office-shift-type-1' },
      data: {
        name: 'Morning',
        lastUpdatedBy: { connect: { id: 'admin-1' } },
      },
    });
    expect(result.updatedOfficeShiftType.name).toBe('Morning');
  });

  test('returns a friendly error when renaming to a name used by another active office shift type', async () => {
    const error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '7.4.2',
      meta: {
        target: ['name'],
      },
    });

    (prisma.officeShiftType.findUnique as jest.Mock).mockResolvedValue({
      id: 'office-shift-type-1',
      name: 'Evening',
      startTime: '16:00',
      endTime: '00:00',
    });
    (prisma.officeShiftType.update as jest.Mock).mockRejectedValue(error);

    await expect(
      updateOfficeShiftTypeWithChangelog('office-shift-type-1', { name: 'Morning' }, 'admin-1')
    ).rejects.toThrow('A Office Shift Type with this name already exists. Please use a different name.');
  });
});
