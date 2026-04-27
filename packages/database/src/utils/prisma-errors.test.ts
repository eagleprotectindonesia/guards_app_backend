import { getUserFriendlyPrismaError } from './prisma-errors';
import { Prisma } from '@prisma/client';

describe('getUserFriendlyPrismaError', () => {
  describe('P2002 - Unique constraint violation', () => {
    it('should handle driverAdapterError with constraint.fields', () => {
      const error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '7.4.2',
        meta: {
          modelName: 'OfficeShiftType',
          driverAdapterError: {
            name: 'DriverAdapterError',
            cause: {
              constraint: {
                fields: ['name'],
              },
            },
          },
        },
      });

      const result = getUserFriendlyPrismaError(error, 'OfficeShiftType');
      expect(result).toBe(
        'A Office Shift Type with this name already exists. Please use a different name.'
      );
    });

    it('should handle meta.target array (standard Prisma)', () => {
      const error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '7.4.2',
        meta: {
          target: ['name'],
        },
      });

      const result = getUserFriendlyPrismaError(error, 'OfficeShiftType');
      expect(result).toBe(
        'A Office Shift Type with this name already exists. Please use a different name.'
      );
    });

    it('should handle stringified driverAdapterError gracefully', () => {
      const error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '7.4.2',
        meta: {
          modelName: 'OfficeShiftType',
          driverAdapterError:
            '{"name":"DriverAdapterError","cause":{"originalCode":"23505","constraint":{"fields":["name"]}}}',
        },
      });

      const result = getUserFriendlyPrismaError(error, 'OfficeShiftType');
      expect(result).toBe(
        'A Office Shift Type with this field already exists. Please use a different field.'
      );
    });

    it('should handle email field uniqueness', () => {
      const error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '7.4.2',
        meta: {
          driverAdapterError: {
            cause: {
              constraint: {
                fields: ['email'],
              },
            },
          },
        },
      });

      const result = getUserFriendlyPrismaError(error, 'Employee');
      expect(result).toBe(
        'A Employee with this email already exists. Please use a different email.'
      );
    });

    it('should handle unknown field names', () => {
      const error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '7.4.2',
        meta: {
          target: ['unknown_field'],
        },
      });

      const result = getUserFriendlyPrismaError(error, 'OfficeShiftType');
      expect(result).toBe(
        'A Office Shift Type with this unknown_field already exists. Please use a different unknown_field.'
      );
    });
  });

  describe('P2003 - Foreign key constraint', () => {
    it('should handle foreign key constraint failure', () => {
      const error = new Prisma.PrismaClientKnownRequestError('Foreign key constraint failed', {
        code: 'P2003',
        clientVersion: '7.4.2',
      });

      const result = getUserFriendlyPrismaError(error, 'OfficeShiftType');
      expect(result).toBe(
        'Cannot office shift type: It is linked to other records that prevent this operation.'
      );
    });
  });

  describe('P2025 - Record not found', () => {
    it('should handle record not found', () => {
      const error = new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '7.4.2',
      });

      const result = getUserFriendlyPrismaError(error, 'OfficeShiftType');
      expect(result).toBe('Office Shift Type not found. It may have been deleted.');
    });
  });

  describe('P2001 - Record does not exist', () => {
    it('should handle record does not exist', () => {
      const error = new Prisma.PrismaClientKnownRequestError('Record does not exist', {
        code: 'P2001',
        clientVersion: '7.4.2',
      });

      const result = getUserFriendlyPrismaError(error, 'OfficeShiftType');
      expect(result).toBe('The referenced office shift type does not exist.');
    });
  });

  describe('Unknown errors', () => {
    it('should handle unknown Prisma error codes', () => {
      const error = new Prisma.PrismaClientKnownRequestError('Some unknown error', {
        code: 'P9999',
        clientVersion: '7.4.2',
      });

      const result = getUserFriendlyPrismaError(error, 'OfficeShiftType');
      expect(result).toBe(
        'An error occurred while processing Office Shift Type. Please try again.'
      );
    });

    it('should handle non-Prisma errors', () => {
      const error = new Error('Some random error');

      const result = getUserFriendlyPrismaError(error, 'OfficeShiftType');
      expect(result).toBe(
        'An unexpected error occurred while processing Office Shift Type.'
      );
    });
  });

  describe('Model label mapping', () => {
    it('should use mapped label for known models', () => {
      const error = new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '7.4.2',
      });

      const result = getUserFriendlyPrismaError(error, 'ShiftType');
      expect(result).toBe('Shift Type not found. It may have been deleted.');
    });

    it('should fallback to raw model name for unknown models', () => {
      const error = new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '7.4.2',
      });

      const result = getUserFriendlyPrismaError(error, 'SomeUnknownModel');
      expect(result).toBe('SomeUnknownModel not found. It may have been deleted.');
    });
  });
});
