import {
  setEmployeePassword,
  EmployeePasswordPolicyError,
} from '../../../packages/database/src/data-access/employees';
import { db as prisma } from '../../../packages/database/src/client';
import { hashPassword, verifyPassword } from '@repo/shared';

jest.mock('../../../packages/database/src/client', () => ({
  db: {
    $transaction: jest.fn(),
  },
}));

jest.mock('@repo/shared', () => ({
  ...jest.requireActual('@repo/shared'),
  hashPassword: jest.fn(),
  verifyPassword: jest.fn(),
}));

describe('employee password policy', () => {
  const tx = {
    employee: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    employeePasswordHistory: {
      findMany: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
    changelog: {
      create: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.$transaction as jest.Mock).mockImplementation(async (callback: (innerTx: typeof tx) => Promise<unknown>) =>
      callback(tx)
    );
    tx.employee.findUnique.mockResolvedValue({ id: 'emp-1', hashedPassword: 'current-hash' });
    tx.employee.update.mockResolvedValue({});
    tx.employeePasswordHistory.create.mockResolvedValue({});
    tx.employeePasswordHistory.deleteMany.mockResolvedValue({});
    tx.changelog.create.mockResolvedValue({});
    (hashPassword as jest.Mock).mockResolvedValue('new-hash');
    (verifyPassword as jest.Mock).mockResolvedValue(false);
  });

  test('rejects when the new password matches one of the latest 3 passwords', async () => {
    tx.employeePasswordHistory.findMany
      .mockResolvedValueOnce([
        { hashedPassword: 'hist-1' },
        { hashedPassword: 'hist-2' },
        { hashedPassword: 'hist-3' },
      ]);
    (verifyPassword as jest.Mock)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    await expect(
      setEmployeePassword({
        employeeId: 'emp-1',
        newPassword: 'Password456',
        actor: { type: 'employee' },
        requireCurrentPassword: 'Current123',
        mustChangePassword: false,
      })
    ).rejects.toThrow(EmployeePasswordPolicyError);

    expect(tx.employee.update).not.toHaveBeenCalled();
  });

  test('allows a fresh password, trims history, and clears the force-change flag', async () => {
    tx.employeePasswordHistory.findMany
      .mockResolvedValueOnce([
        { hashedPassword: 'hist-1' },
        { hashedPassword: 'hist-2' },
      ])
      .mockResolvedValueOnce([{ id: 'old-1' }]);
    (verifyPassword as jest.Mock)
      .mockResolvedValueOnce(true)
      .mockResolvedValue(false);

    await setEmployeePassword({
      employeeId: 'emp-1',
      newPassword: 'BrandNew123',
      actor: { type: 'employee' },
      requireCurrentPassword: 'Current123',
      mustChangePassword: false,
    });

    expect(tx.employee.update).toHaveBeenCalledWith({
      where: { id: 'emp-1' },
      data: { hashedPassword: 'new-hash', mustChangePassword: false },
    });
    expect(tx.employeePasswordHistory.create).toHaveBeenCalledWith({
      data: {
        employeeId: 'emp-1',
        hashedPassword: 'new-hash',
      },
    });
    expect(tx.employeePasswordHistory.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['old-1'] } },
    });
  });

  test('admin reset records changelog and sets the force-change flag', async () => {
    tx.employeePasswordHistory.findMany
      .mockResolvedValueOnce([{ hashedPassword: 'hist-1' }])
      .mockResolvedValueOnce([]);
    (verifyPassword as jest.Mock).mockResolvedValue(false);

    await setEmployeePassword({
      employeeId: 'emp-1',
      newPassword: 'Reset1234',
      actor: { type: 'admin', adminId: 'admin-1' },
      mustChangePassword: true,
    });

    expect(tx.changelog.create).toHaveBeenCalledWith({
      data: {
        action: 'UPDATE',
        entityType: 'Employee',
        entityId: 'emp-1',
        actor: 'admin',
        actorId: 'admin-1',
        details: { field: 'password', status: 'changed' },
      },
    });
    expect(tx.employee.update).toHaveBeenCalledWith({
      where: { id: 'emp-1' },
      data: { hashedPassword: 'new-hash', mustChangePassword: true },
    });
  });
});
