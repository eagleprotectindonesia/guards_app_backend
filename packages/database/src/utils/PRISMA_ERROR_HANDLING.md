# User-Friendly Prisma Error Handling

## Overview

This guide explains how to use the `getUserFriendlyPrismaError` utility to convert raw Prisma errors into user-friendly messages.

## Problem

When Prisma throws database errors (like unique constraint violations), the raw error messages are technical and not suitable for end users. For example:

```
Unique constraint failed on the fields: (`name`)
```

## Solution

The `getUserFriendlyPrismaError` utility converts these into friendly messages:

```
A Office Shift Type with this name already exists. Please use a different name.
```

## Usage

### 1. Import the utility

```typescript
import { getUserFriendlyPrismaError } from '../utils/prisma-errors';
```

### 2. Wrap repository functions with try-catch

```typescript
export async function createOfficeShiftTypeWithChangelog(
  data: Prisma.OfficeShiftTypeCreateInput, 
  adminId: string
) {
  try {
    return await prisma.$transaction(async tx => {
      // ... your logic here
    });
  } catch (error) {
    throw new Error(getUserFriendlyPrismaError(error, 'OfficeShiftType'));
  }
}
```

### 3. For functions that throw custom errors, preserve them

```typescript
export async function updateOfficeShiftTypeWithChangelog(
  id: string,
  data: Prisma.OfficeShiftTypeUpdateInput,
  adminId: string
) {
  try {
    return await prisma.$transaction(async tx => {
      if (!before) {
        throw new Error('Office Shift Type not found'); // Custom error
      }
      // ... logic
    });
  } catch (error) {
    // Preserve custom errors
    if (error instanceof Error && error.message === 'Office Shift Type not found') {
      throw error;
    }
    throw new Error(getUserFriendlyPrismaError(error, 'OfficeShiftType'));
  }
}
```

## Supported Error Codes

| Prisma Code | User-Friendly Message |
|-------------|----------------------|
| P2002 | "A {Model} with this {field} already exists. Please use a different {field}." |
| P2003 | "Cannot {model}: It is linked to other records that prevent this operation." |
| P2025 | "{Model} not found. It may have been deleted." |
| P2001 | "The referenced {model} does not exist." |
| Other | "An error occurred while processing {Model}. Please try again." |

## Supported Models

The utility has friendly labels for these models:
- Role
- Site
- Office
- ShiftType
- OfficeShiftType
- OfficeWorkSchedule
- Employee
- Admin
- OfficeShift

For models not in this list, the raw model name will be used.

## Supported Fields

Field names are also mapped to friendly labels:
- name → "Name"
- code → "Code"
- email → "Email"

## Adding New Models/Fields

Edit the `MODEL_LABELS` and `FIELD_LABELS` objects in `prisma-errors.ts`:

```typescript
const MODEL_LABELS: Record<string, string> = {
  // Add new models here
  MyNewModel: 'My New Model',
};

const FIELD_LABELS: Record<string, string> = {
  // Add new fields here
  phoneNumber: 'Phone Number',
};
```
