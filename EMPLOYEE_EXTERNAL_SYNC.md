# Employee External Sync Process

This document describes the employee synchronization process that imports employee data from an external HR/management system into the guard scheduling application.

## Overview

The sync process fetches employee records from an external API and synchronizes them with the local database. It handles:
- **Adding** new employees not present in the local database
- **Updating** existing employee profile information
- **Deactivating** employees that no longer exist in the external system

## Architecture

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│  External API   │────▶│  syncEmployeesFrom    │────▶│  Local Database │
│  (HR System)    │     │  External()           │     │  (Prisma)       │
└─────────────────┘     └──────────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌──────────────────────┐
                        │  @repo/database      │
                        │  packages/database   │
                        │  /src/data-access/   │
                        │  employees.ts        │
                        └──────────────────────┘
```

## Data Flow

### 1. Frontend Trigger (Admin UI)

**File:** `apps/web/app/admin/(authenticated)/employees/components/employee-list.tsx`

```typescript
// User clicks "Sync Employees" button
startTransition(async () => {
  const result = await syncEmployeesAction();
  // Handle success/error with toast notifications
});
```

### 2. Server Action

**File:** `apps/web/app/admin/(authenticated)/employees/actions.ts`

```typescript
export async function syncEmployeesAction() {
  // 1. Verify admin authentication
  const adminId = await getAdminIdFromToken();
  if (!adminId) return { success: false, message: 'Unauthorized' };

  // 2. Enqueue the sync job
  await employeeSyncQueue.add(EMPLOYEE_SYNC_JOB_NAME, { triggeredBy: adminId });

  // 3. Return immediate success (Job is async)
  return {
    success: true,
    message: 'Sync queued. The employee list will update shortly.',
  };
}
```

### 3. Core Sync Logic

**File:** `packages/database/src/data-access/employees.ts`

```typescript
export async function syncEmployeesFromExternal() {
  // Step 1: Fetch from external API
  const externalEmployees = await fetchExternalEmployees();

  // Step 2: Get existing employee IDs
  const existingEmployees = await prisma.employee.findMany({
    where: { id: { in: externalIds } },
    select: { id: true },
  });
  const existingIds = new Set(existingEmployees.map(e => e.id));

  // Step 3: Process each external employee
  for (const ext of externalEmployees) {
    const role: EmployeeRole = ext.office_id ? 'office' : 'on_site';

    if (!existingIds.has(ext.id)) {
      // NEW: Create with default password
      const defaultPassword = '12345678';
      const hashedPassword = await hashPassword(defaultPassword);
      await upsertEmployeeFromExternal({ ...ext, password: hashedPassword, role });
      addedCount++;
    } else {
      // EXISTING: Update profile only (no password change)
      await upsertEmployeeFromExternal({ ...ext, role });
      updatedCount++;
    }
  }

  // Step 4: Deactivate employees not in external list
  const { deactivatedCount } = await deactivateEmployeesNotIn(externalIds);

  return { added: addedCount, updated: updatedCount, deactivated: deactivatedCount };
}
```

### 4. External API Integration

**File:** `packages/database/src/external-employee-api.ts`

```typescript
export interface ExternalEmployee {
  id: string;
  employee_number: string;
  personnel_id: string | null;
  nickname: string | null;
  full_name: string;
  job_title: string | null;
  department: string | null;
  office_id: string | null;
  office_name: string | null;
}

export async function fetchExternalEmployees(): Promise<ExternalEmployee[]> {
  const response = await fetch(EXTERNAL_EMPLOYEE_ADDRESS, {
    headers: {
      'x-internal-api-key': EXTERNAL_EMPLOYEE_API_KEY,
    },
  });
  return await response.json();
}
```

## Configuration

### Environment Variables

Add these to your `.env` file:

```bash
# External Employee API Configuration
EXTERNAL_EMPLOYEE_ADDRESS=https://external-hr-api.example.com/api/employees
EXTERNAL_EMPLOYEE_API_KEY=your-secret-api-key
```

| Variable | Description | Required |
|----------|-------------|----------|
| `EXTERNAL_EMPLOYEE_ADDRESS` | Full URL of the external employee API endpoint | Yes |
| `EXTERNAL_EMPLOYEE_API_KEY` | API key for authenticating with the external system | Yes |

## Business Rules

### Role Mapping

| External Field | Condition | Local Role |
|----------------|-----------|------------|
| `office_id` | Not null | `office` |
| `office_id` | Null | `on_site` |

### Default Password

For **new employees**, the default password is set to:
1. `12345678` (static default)

The password is hashed using bcrypt before storage.

### Update Behavior

| Field | New Employee | Existing Employee |
|-------|--------------|-------------------|
| `employeeNumber` | ✅ Set | ✅ Update |
| `personnelId` | ✅ Set | ✅ Update |
| `nickname` | ✅ Set | ✅ Update |
| `fullName` | ✅ Set | ✅ Update |
| `jobTitle` | ✅ Set | ✅ Update |
| `department` | ✅ Set | ✅ Update |
| `role` | ✅ Set | ✅ Update |
| `hashedPassword` | ✅ Set (default) | ❌ No change |

### Deactivation Logic

When an employee is **not present** in the external API response but exists locally with `status: true`, they are **deactivated**. This triggers a comprehensive cleanup:

1. **Employee Record**
   - `status` set to `false`
   - `tokenVersion` incremented (invalidates active sessions)
   - `deletedAt` timestamp set

2. **Future Shifts** (status: `scheduled`, starts after current time)
   - Soft-deleted (`deletedAt` set)
   - Logged in changelog as `BULK_DELETE`
   - Employee notified via Redis stream (`shifts_deleted`)

3. **In-Progress Shifts** (status: `in_progress`)
   - Status changed to `cancelled`
   - Soft-deleted (`deletedAt` set)
   - **All associated alerts auto-resolved**
   - Logged in changelog as `BULK_CANCEL`

4. **Active Alerts** (all unresolved alerts for employee's shifts)
   - `resolvedAt` timestamp set
   - `resolutionType` set to `auto`
   - `resolutionNote`: "Auto-resolved: Employee deactivated."

This ensures no orphaned shifts or dangling alerts remain when an employee leaves the organization.

## API Route (Optional)

**File:** `apps/web/app/api/admin/employees/sync/route.ts`

An HTTP endpoint is available for programmatic access:

```bash
POST /api/admin/employees/sync
Content-Type: application/json
```

**Response:**
```json
{
  "success": true,
  "jobId": "123",
  "message": "Sync queued. Results will appear shortly."
}
```

## Logging

The sync process outputs console logs for monitoring:

```
[SyncEmployees] Fetched 150 employees from external API
[SyncEmployees] Sync completed: 5 added, 120 updated, 2 deactivated
```

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Missing env vars | Throws error: "EXTERNAL_EMPLOYEE_ADDRESS or EXTERNAL_EMPLOYEE_API_KEY not configured" |
| External API failure | Throws error with status text, sync aborts |
| Database error | Transaction rolls back, error logged to console |
| Unauthorized access | Server action returns `{ success: false, message: 'Unauthorized' }` |

## Testing

### Manual Test (Admin UI)

1. Navigate to `/admin/employees`
2. Click the **"Sync Employees"** button
3. Verify toast notification shows "Sync queued"
4. Check **Worker Logs** to see sync processing
5. Refresh employee list after a few seconds

### Programmatic Test

```bash
curl -X POST http://localhost:3000/api/admin/employees/sync \
  -H "Content-Type: application/json"
```

## Related Files

| File | Purpose |
|------|---------|
| `packages/database/src/data-access/employees.ts` | Core sync logic, deactivation handling |
| `packages/database/src/data-access/shifts.ts` | Shift cleanup (future delete, in-progress cancel) |
| `packages/database/src/external-employee-api.ts` | External API client |
| `packages/database/src/client.ts` | Prisma client & upsert logic |
| `apps/web/app/admin/(authenticated)/employees/actions.ts` | Server action |
| `apps/web/app/admin/(authenticated)/employees/components/employee-list.tsx` | UI component |
| `apps/web/app/api/admin/employees/sync/route.ts` | HTTP API endpoint |

## Best Practices

1. **Run sync during off-peak hours** to minimize database load
2. **Monitor logs** for sync failures or unexpected deactivation counts
3. **Backup database** before initial sync or large updates
4. **Test with staging environment** before production deployment
5. **Review deactivated employees** to ensure no accidental removals

## Troubleshooting

### Sync returns 0 added/updated/deactivated
- Check if external API is returning data
- Verify environment variables are set correctly
- Check network connectivity to external API

### "Unauthorized" error
- Ensure admin is logged in with valid session
- Verify token in cookies is not expired

### Database constraint errors
- Check for duplicate employee IDs in external system
- Verify Prisma schema matches database structure
