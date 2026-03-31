# Bulk Office Shift Preview Feature Plan

## Status: ✅ IMPLEMENTED

Feature has been fully implemented as described below.

## Overview

Add a preview step to the bulk office shift CSV upload flow that:
1. Parses the CSV and validates data
2. Groups shifts by employee (sorted by employee code)
3. Displays employee names alongside codes
4. Shows the date range (first to last date) for each employee
5. Fills in missing dates as "day off"
6. Allows user confirmation before final upload

## Current Flow

```
User selects CSV → Immediate upload → Success/Error
```

## New Flow

```
User selects CSV → Parse & Validate → Show Preview → User Confirms → Upload → Success/Error
```

## Technical Approach

### Backend Changes (Server Actions)

#### 1. New Action: `parseAndValidateOfficeShiftsCSV`

**Purpose:** Parse CSV, validate, and return preview data without creating shifts.

**Location:** `apps/web/app/admin/(authenticated)/office-shifts/actions.ts`

**Returns:**
```typescript
interface OfficeShiftPreviewData {
  success: boolean;
  message?: string;
  errors?: string[];
  preview?: {
    employees: Array<{
      employeeCode: string;
      employeeName: string;
      employeeId: string;
      firstDate: string;
      lastDate: string;
      totalShifts: number;
      shifts: Array<{
        date: string;
        shiftTypeName: string;
        startTime: string;
        endTime: string;
        note?: string | null;
        isDayOff?: boolean;
        error?: string;
      }>;
    }>;
    totalShiftsToCreate: number;
    totalEmployees: number;
    dateRange: {
      start: string;
      end: string;
    };
  };
}
```

**Logic:**
1. Parse CSV file
2. Validate headers and each row (same validation as current `bulkCreateOfficeShifts`)
3. Group rows by `employee_code`
4. Sort employees by `employee_code`
5. For each employee:
   - Find min and max dates
   - Generate all dates in range
   - Mark dates not in CSV as "day off"
   - Sort shifts by date
6. Return preview data

#### 2. Modified Action: `bulkCreateOfficeShifts`

**Change:** Keep existing logic unchanged - it already handles the actual creation.

### Repository Changes

#### 1. New Function: `getOfficeEmployeesByCodes`

**Location:** `packages/database/src/repositories/employees.ts`

**Purpose:** Fetch employee details for a list of employee codes.

```typescript
export async function getOfficeEmployeesByCodes(
  employeeCodes: string[]
): Promise<
  Array<{
    id: string;
    fullName: string;
    employeeNumber: string;
  }>
> {
  return prisma.employee.findMany({
    where: {
      employeeNumber: {
        in: employeeCodes.map(code => code.toLowerCase()),
      },
      status: true,
      deletedAt: null,
      role: 'office',
      officeAttendanceMode: 'shift_based',
    },
    select: {
      id: true,
      fullName: true,
      employeeNumber: true,
    },
  });
}
```

### Frontend Changes

#### 1. Updated Component: `OfficeBulkCreateModal`

**Location:** `apps/web/app/admin/(authenticated)/office-shifts/components/office-bulk-create-modal.tsx`

**New State:**
```typescript
const [previewStep, setPreviewStep] = useState(false);
const [previewData, setPreviewData] = useState<OfficeShiftPreviewData | null>(null);
const [isConfirming, setIsConfirming] = useState(false);
```

**New Flow:**
1. User selects file → Call `parseAndValidateOfficeShiftsCSV`
2. If validation errors → Show errors (current behavior)
3. If success → Show preview with:
   - Summary stats (total employees, total shifts, date range)
   - Expandable employee cards sorted by employee code
   - Each card shows:
     - Employee name and code
     - Date range
     - List of shifts (with "day off" markers for gaps)
   - "Confirm & Upload" and "Cancel" buttons
4. User clicks "Confirm & Upload" → Call `bulkCreateOfficeShifts`
5. Show success/error and close modal

### UI Mockup

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Preview Office Shifts                                    [×]          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Summary                                                                │
│  ─────────────────────────────────────────────────────────────────────  │
│  📊 3 Employees    📅 45 Shifts    📆 Jan 1, 2025 - Jan 31, 2025       │
│                                                                         │
│  Employee Shifts (sorted by employee code)                              │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                         │
│  ▼ GUARD001 - John Doe                                                  │
│    ─────────────────────────────────────────────────────────────────    │
│    Jan 1, 2025 - Jan 15, 2025 (15 days)                                 │
│                                                                         │
│    Date          Shift Type         Time          Status                │
│    ─────────────────────────────────────────────────────────────────    │
│    Jan 1         Morning Shift      08:00-16:00   ✓ Scheduled          │
│    Jan 2         Morning Shift      08:00-16:00   ✓ Scheduled          │
│    Jan 3         Afternoon Shift    16:00-00:00   ✓ Scheduled          │
│    Jan 4         —                  —             🌴 Day Off            │
│    Jan 5         Morning Shift      08:00-16:00   ✓ Scheduled          │
│    ...                                                                    │
│                                                                         │
│  ▼ GUARD002 - Jane Smith                                                │
│    ─────────────────────────────────────────────────────────────────    │
│    Jan 1, 2025 - Jan 20, 2025 (20 days)                                 │
│                                                                         │
│    Date          Shift Type         Time          Status                │
│    ─────────────────────────────────────────────────────────────────    │
│    Jan 1         Night Shift        00:00-08:00   ✓ Scheduled          │
│    Jan 2         Night Shift        00:00-08:00   ✓ Scheduled          │
│    Jan 3         —                  —             🌴 Day Off            │
│    Jan 4         —                  —             🌴 Day Off            │
│    Jan 5         Night Shift        00:00-08:00   ✓ Scheduled          │
│    ...                                                                    │
│                                                                         │
│  ▼ GUARD003 - Bob Wilson                                                │
│    ─────────────────────────────────────────────────────────────────    │
│    Jan 5, 2025 - Jan 25, 2025 (21 days)                                 │
│    ...                                                                  │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                    [Cancel]  [Confirm & Upload]         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Component Structure

```typescript
// Main modal with two-step flow
OfficeBulkCreateModal
├── Step 1: File Upload (current UI)
│   └── File input + Download Example button
├── Step 2: Preview (new UI)
│   ├── Summary Section
│   │   ├── Total employees count
│   │   ├── Total shifts count
│   │   └── Overall date range
│   ├── Employee Cards (sorted by employee code)
│   │   ├── EmployeeHeader (expandable)
│   │   │   ├── Employee code
│   │   │   ├── Employee name
│   │   │   └── Date range + total days
│   │   └── ShiftTable
│   │       ├── Date column
│   │       ├── Shift type column
│   │       ├── Time column
│   │       └── Status column (Scheduled / Day Off)
│   └── Action Buttons
│       ├── Cancel (returns to Step 1)
│       └── Confirm & Upload (proceeds to upload)
└── Error Display (shared)
    └── Validation errors list
```

## Implementation Steps

Completed:

1. **✅ Created repository function** (`packages/database/src/repositories/employees.ts`)
   - `getOfficeEmployeesByCodes` - Fetches office employees by employee codes

2. **✅ Created server action** (`apps/web/app/admin/(authenticated)/office-shifts/actions.ts`)
   - `parseAndValidateOfficeShiftsCSV` - Parses CSV, validates, and returns preview data
   - Reuses existing validation logic
   - Generates preview data with "day off" detection
   - Groups shifts by employee and sorts by employee code
   - Fills in missing dates as "day off"

3. **✅ Updated modal component** (`apps/web/app/admin/(authenticated)/office-shifts/components/office-bulk-create-modal.tsx`)
   - Added preview state management
   - Added preview UI with expandable employee cards
   - Implemented two-step flow (upload → preview → confirm)
   - Added summary section with total employees, shifts, and date range
   - Added sortable employee cards with shift details
   - Added "day off" visual markers

## Files Modified

1. `packages/database/src/repositories/employees.ts` - Added `getOfficeEmployeesByCodes`
2. `apps/web/app/admin/(authenticated)/office-shifts/actions.ts` - Added `parseAndValidateOfficeShiftsCSV`
3. `apps/web/app/admin/(authenticated)/office-shifts/components/office-bulk-create-modal.tsx` - Complete rewrite with preview UI

## Dependencies

- `date-fns` - Already available for date manipulation (`eachDayOfInterval`, `format`)
- No new npm packages required

### Generating "Day Off" Markers

```typescript
function generateShiftsWithDayOffs(
  rows: ParsedCSVRow[],
  shiftTypes: Map<string, ShiftTypeData>
): ShiftPreview[] {
  // Get all dates from CSV for this employee
  const csvDates = new Set(rows.map(r => r.date));
  
  // Find min and max dates
  const dates = Array.from(csvDates).sort();
  const firstDate = dates[0];
  const lastDate = dates[dates.length - 1];
  
  // Generate all dates in range
  const allDates = getAllDatesInRange(firstDate, lastDate);
  
  // Build shift map
  const shiftMap = new Map<string, ParsedCSVRow>();
  rows.forEach(row => shiftMap.set(row.date, row));
  
  // Generate preview rows
  return allDates.map(date => {
    const row = shiftMap.get(date);
    if (row) {
      const shiftType = shiftTypes.get(row.shiftTypeName.toLowerCase())!;
      return {
        date,
        shiftTypeName: row.shiftTypeName,
        startTime: shiftType.startTime,
        endTime: shiftType.endTime,
        note: row.note,
        isDayOff: false,
      };
    } else {
      return {
        date,
        shiftTypeName: '—',
        startTime: '—',
        endTime: '—',
        note: null,
        isDayOff: true,
      };
    }
  });
}
```

## Validation Rules (Unchanged)

- Employee must exist and be `role = office` with `officeAttendanceMode = shift_based`
- Office shift type name must exist
- Date must be valid (YYYY-MM-DD format)
- Generated shift window must not overlap existing office shifts
- Generated shift window must not overlap another row in the same upload batch
- All-or-nothing import

## Edge Cases to Handle

1. **Single date for employee:** No "day off" markers needed
2. **Non-consecutive dates:** Multiple "day off" blocks
3. **Overlapping date ranges between employees:** Each employee handled independently
4. **Empty CSV rows:** Skip during parsing
5. **Invalid employee codes:** Show in validation errors, don't include in preview
6. **Very large date ranges:** Consider pagination or virtualization for 100+ rows per employee

## Testing Checklist

- [ ] CSV with single employee, consecutive dates
- [ ] CSV with single employee, non-consecutive dates (gaps)
- [ ] CSV with multiple employees, different date ranges
- [ ] CSV with invalid employee codes (should error before preview)
- [ ] CSV with invalid shift types (should error before preview)
- [ ] CSV with overlapping shifts (should error before preview)
- [ ] CSV with very large date range (6+ months)
- [ ] Employee sorting verification (by code, not name)
- [ ] "Day off" marker accuracy
- [ ] Confirm & Upload creates correct shifts
- [ ] Cancel returns to file upload step

## Files to Modify

1. `packages/database/src/repositories/employees.ts` - Add `getOfficeEmployeesByCodes`
2. `apps/web/app/admin/(authenticated)/office-shifts/actions.ts` - Add `parseAndValidateOfficeShiftsCSV`
3. `apps/web/app/admin/(authenticated)/office-shifts/components/office-bulk-create-modal.tsx` - Complete rewrite with preview UI
4. (Optional) `apps/web/app/admin/(authenticated)/office-shifts/components/office-shift-preview.tsx` - New component for preview table

## Dependencies

- `date-fns` - Already available for date manipulation
- `react-datepicker` - Already in use
- No new npm packages required
