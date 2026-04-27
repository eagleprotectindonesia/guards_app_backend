import { Prisma } from '@prisma/client';

/**
 * Maps Prisma model names to human-readable labels
 */
const MODEL_LABELS: Record<string, string> = {
  Role: 'Role',
  Site: 'Site',
  Office: 'Office',
  ShiftType: 'Shift Type',
  OfficeShiftType: 'Office Shift Type',
  OfficeWorkSchedule: 'Office Work Schedule',
  Employee: 'Employee',
  Admin: 'Admin',
  OfficeShift: 'Office Shift',
};

/**
 * Maps field names to human-readable labels
 */
const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  code: 'Code',
  email: 'Email',
};

/**
 * Extracts the conflicting field from a Prisma P2002 error
 * Handles multiple Prisma versions and driver adapter formats
 */
function extractFieldFromUniqueError(error: Prisma.PrismaClientKnownRequestError): string {
  // Try meta.target first (standard Prisma behavior)
  if (Array.isArray(error.meta?.target) && error.meta.target.length > 0) {
    const target = error.meta.target.find((t: string) => FIELD_LABELS[t]) ?? error.meta.target[error.meta.target.length - 1];
    return target;
  }

  // Try driverAdapterError.cause.constraint.fields (Prisma 7 with driver adapters)
  try {
    const driverError = error.meta?.driverAdapterError as
      | { cause?: { constraint?: { fields?: string[] } } }
      | undefined;
    if (driverError?.cause?.constraint?.fields && driverError.cause.constraint.fields.length > 0) {
      return driverError.cause.constraint.fields[0];
    }
  } catch {
    // driverAdapterError might be stringified or malformed
  }

  // Try to extract from error message as last resort
  // Format: "Unique constraint failed on the field: `fieldName`" or similar
  const match = error.message.match(/field[`]?\s*`?(\w+)`?/i);
  if (match) {
    return match[1];
  }

  return 'field';
}

/**
 * Converts a Prisma error into a user-friendly error message
 * @param error - The caught error (usually Prisma.PrismaClientKnownRequestError)
 * @param modelName - The Prisma model name (e.g., 'OfficeShiftType')
 * @returns A user-friendly error message
 */
export function getUserFriendlyPrismaError(
  error: unknown,
  modelName: string
): string {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return `An unexpected error occurred while processing ${getLabel(modelName)}.`;
  }

  const modelLabel = getLabel(modelName);

  switch (error.code) {
    case 'P2002': {
      const field = extractFieldFromUniqueError(error);
      const fieldLabel = FIELD_LABELS[field] ?? field;
      return `A ${modelLabel} with this ${fieldLabel.toLowerCase()} already exists. Please use a different ${fieldLabel.toLowerCase()}.`;
    }

    case 'P2003': {
      return `Cannot ${modelLabel.toLowerCase()}: It is linked to other records that prevent this operation.`;
    }

    case 'P2025': {
      return `${modelLabel} not found. It may have been deleted.`;
    }

    case 'P2001': {
      return `The referenced ${modelLabel.toLowerCase()} does not exist.`;
    }

    default:
      console.error(`Prisma error [${error.code}] on ${modelName}:`, error.message);
      return `An error occurred while processing ${modelLabel}. Please try again.`;
  }
}

/**
 * Gets a human-readable label for a Prisma model
 */
function getLabel(modelName: string): string {
  return MODEL_LABELS[modelName] ?? modelName;
}
