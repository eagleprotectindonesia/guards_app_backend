# Shift Photo Report Backend Guide

## Purpose

This document is the source of truth for the Auto Shift Photo Report feature. It covers the data model, worker automation, available repository functions, REST endpoints, S3 storage layout, and the existing RSC admin page.

Use this doc as the baseline for frontend/UI implementation.

## Data Model

### Enum: `ShiftPhotoReportStatus` (`packages/database/prisma/schema.prisma`)

```
pending     → report row created, PDF generation in progress
generated   → PDF uploaded to S3, ready to download
failed      → PDF generation errored (retryable, max 3 attempts)
regenerated → superseded by a newer report (manual regenerate)
```

### Model: `ShiftPhotoReport` (`packages/database/prisma/schema.prisma`)

| Field | Type | Notes |
|---|---|---|
| `id` | `String (uuid)` | PK |
| `shiftId` | `String` | FK → `Shift.id` |
| `employeeId` | `String` | FK → `Employee.id` (denormalized for fast listing) |
| `clientId` | `String?` | Denormalized from `Site.clientName` at report creation time |
| `shiftStartsAt` | `DateTime` | Snapshot from Shift (WITA context) |
| `shiftEndsAt` | `DateTime` | Snapshot from Shift (WITA context) |
| `status` | `ShiftPhotoReportStatus` | `pending` → `generated` / `failed` / `regenerated` |
| `pdfS3Key` | `String?` | S3 key of the generated PDF |
| `pdfS3Bucket` | `String?` | S3 bucket name |
| `pdfSizeBytes` | `Int?` | PDF file size |
| `photoCount` | `Int` | Number of photos sourced from chat (not PDF pages) |
| `generatedAt` | `DateTime?` | When PDF was successfully uploaded |
| `errorMessage` | `String?` | Last error detail if failed |
| `attemptCount` | `Int` | Incremented on each retry (max 3) |
| `regeneratedFromId` | `String?` | Self-referential FK — links a regenerate to its source report |
| `triggeredBy` | `String` | `"auto"` (worker) or `"manual"` (admin regenerate) |
| `createdByAdminId` | `String?` | Admin ID if manually triggered (plain string, no FK) |
| `createdAt` | `DateTime` | |
| `updatedAt` | `DateTime` | |

#### Indexes

- `@@index([shiftId, createdAt])`
- `@@index([employeeId, createdAt])`
- `@@index([status])`
- `@@index([regeneratedFromId])`

### Columns added to `Shift` (`packages/database/prisma/schema.prisma`)

| Column | Type | Purpose |
|---|---|---|
| `autoPhotoReportStatus` | `ShiftPhotoReportStatus?` | Worker claim/lifecycle (`null`=unprocessed, `pending`=claimed, `generated`, `failed`) |
| `lastAutoPhotoReportId` | `String?` | Denormalized pointer to the latest `ShiftPhotoReport.id` |
| `lastAutoPhotoReportAt` | `DateTime?` | Timestamp of the last claim attempt (used for stale-pending crash recovery) |

## S3 Key Structure

Generated PDFs are stored in S3 under this hierarchy (mirrors the chat attachment pattern):

```
shift-reports/env={env}/site_{siteId}/shift_{shiftId}/report_{reportId}/{fileName}.pdf
```

- `env`: `prod`, `development`, or the value of `NODE_ENV` environment variable.
- `siteId` / `shiftId` / `reportId`: the corresponding model UUIDs.
- `fileName`: sanitized (`GuardName_EmployeeNo_date.pdf`).

If any of `siteId` / `shiftId` / `reportId` is missing, the code falls back to `shift-reports/{timestamp}-{fileName}.pdf` with a console warning (same pattern as the chat branch in `packages/storage/src/s3.ts`).

## Automation: Worker Job

**Queue**: `shift-photo-report` (BullMQ repeatable queue)

**Job name**: `shift-photo-report-scan`

**Schedule**: Every 5 minutes (`SHIFT_PHOTO_REPORT_INTERVAL_MS` in `apps/worker/src/worker.ts`)

**Trigger**: Shifts with `status = completed` AND `endsAt + 10 min <= now` AND no successful report exists yet.

**Idempotency**: `updateMany` on the `Shift` table with the condition `autoPhotoReportStatus IS NULL OR (autoPhotoReportStatus = 'failed' AND lastAutoPhotoReportAt < now) OR (autoPhotoReportStatus = 'pending' AND lastAutoPhotoReportAt < now - 30min)`. Only one worker wins the atomic claim.

**Flow per shift**:
1. Claim the shift (atomic `updateMany`).
2. Fetch photos from direct chat (`ChatMessage` with `status='sent'`, `employeeId = shift.employeeId`, `createdAt` between shift start/end, `attachments` non-empty). Deduplicate by S3 key.
3. Download photo buffers from S3.
4. Create a `ShiftPhotoReport` row with `status = pending`.
5. Generate the PDF via pdfkit (cover page + per-photo pages with captions).
6. Upload PDF to S3.
7. Mark report as `generated`.
8. On any error: mark as `failed`. Resets the Shift claim to `null` if no report row was created (next tick retries).

**What statuses are scanned?**

Only `completed` shifts. `in_progress` and `missed` are excluded.

**Grace period**: 10 minutes after `endsAt` (configurable constant `SHIFT_PHOTO_REPORT_WAIT_MINUTES = 10` in `packages/database/src/repositories/shift-photo-reports.ts`).

## Repository Functions

All exported from `@repo/database` (`packages/database/src/repositories/shift-photo-reports.ts`):

### Candidate & Claim (worker use)

| Function | Returns | Description |
|---|---|---|
| `getOnsiteShiftPhotoReportCandidates(now, graceAfterEndMins?)` | `Shift[]` | Finds `completed` shifts past `endsAt + grace` with no successful report. Includes stale-pending (>30min) and failed. |
| `claimOnsiteShiftPhotoReport(shiftId, now)` | `boolean` | Atomic `updateMany` — sets `autoPhotoReportStatus = pending`. Returns `true` if claimed (another worker didn't). |
| `getShiftReportPhotos({ employeeId, startsAt, endsAt })` | `{ messageId, s3Key, createdAt }[]` | Extracts deduped photos from `ChatMessage` within the shift's time window. |
| `resetShiftPhotoReportClaim(shiftId)` | `boolean` | Resets `autoPhotoReportStatus` to `null` for crash recovery (when error occurs before report row is created). |

### Lifecycle (worker use)

| Function | Description |
|---|---|
| `createShiftPhotoReport({ shiftId, employeeId, clientId, shiftStartsAt, shiftEndsAt, triggeredBy?, createdByAdminId?, photoCount? })` | Creates a `pending` report row. Returns the created report. |
| `markShiftPhotoReportGenerated({ id, pdfS3Key, pdfS3Bucket, pdfSizeBytes, photoCount })` | Transactional: updates report → `generated` + updates Shift status. |
| `markShiftPhotoReportFailed({ id, errorMessage })` | Transactional: updates report → `failed` + increments `attemptCount` + updates Shift status. |
| `getShiftPhotoReportByShiftId(shiftId)` | Returns the latest report row for a shift (null if none). |

### Admin query (RSC / REST use)

| Function | Description |
|---|---|
| `listShiftPhotoReportsPaginated({ dateFrom?, dateTo?, employeeId?, clientId?, status?, page, pageSize })` | Returns `{ reports, totalCount }`. Reports include `employee` (fullName, employeeNumber). Sorted by `createdAt DESC`. |
| `getShiftPhotoReportById(id)` | Returns full report with `shift` (including `shiftType.name`) and `employee`. |
| `createRegeneratedShiftPhotoReport({ originalReportId, adminId })` | Creates a new report row with `regeneratedFromId`, sets the old report to `regenerated`, updates Shift pointer. Returns the new report. |

## REST Endpoints

### `GET /api/admin/shift-photo-reports/[id]`

Returns a single report as JSON with a presigned download URL:

```json
{
  "id": "uuid",
  "status": "generated",
  "photoCount": 5,
  "pdfS3Key": "shift-reports/env=dev/...",
  "generatedAt": "2026-06-15T10:00:00.000Z",
  "shiftStartsAt": "2026-06-15T08:00:00.000Z",
  "shiftEndsAt": "2026-06-15T16:00:00.000Z",
  "downloadUrl": "https://s3.amazonaws.com/...?presigned...",
  "employee": { "fullName": "...", "employeeNumber": "..." },
  "shift": {
    "shiftType": { "name": "Morning Shift" }
  }
}
```

- The `downloadUrl` has a 7-day expiry by default (configurable in `getCachedPresignedDownloadUrl`).
- Auth: `getAdminAuthSession()` (admin session required).

## Existing RSC Admin Page

**Path**: `/admin/shift-photo-reports` (at `apps/web/app/admin/(authenticated)/shift-photo-reports/page.tsx`)

This is a server component that:
- Checks `PERMISSIONS.SHIFTS.VIEW` permission.
- Reads `searchParams` filters: `dateFrom`, `dateTo`, `employeeId`, `clientId`, `status`, `page`.
- Calls `listShiftPhotoReportsPaginated` directly (no REST call).
- Computes presigned download URLs inline via `getCachedPresignedDownloadUrl` from `@repo/storage`.
- Renders a table with columns: Guard, Client, Shift window, Photos count, Status badge, Created date, Actions (download link + regenerate form).

**Regenerate**: The page includes a `<form>` that POSTs to a server action. The action calls `createRegeneratedShiftPhotoReport({ originalReportId, adminId })`, then `revalidatePath('/admin/shift-photo-reports')`.

## Status Lifecycle

```
[Shift ends]
    ↓ (worker tick, 5 min interval)
[autoPhotoReportStatus: null]
    ↓ claimOnsiteShiftPhotoReport
[autoPhotoReportStatus: pending]  ──→  [ShiftPhotoReport created: pending]
    ↓ generate PDF + upload to S3  │
[autoPhotoReportStatus: generated]  │  [ShiftPhotoReport: generated]
    ↓ admin clicks "Regenerate"    │
[old report: regenerated]          │
    ↓ createRegeneratedShiftPhotoReport │
[new ShiftPhotoReport: pending]    │
    ↓ worker processes it
[new ShiftPhotoReport: generated]  │
```

If any step fails:
- `markShiftPhotoReportFailed` → `ShiftPhotoReport: failed`, `autoPhotoReportStatus: failed`.
- Next tick retries (candidate query includes `failed` with `lastAutoPhotoReportAt < now`).
- After 3 attempts, stays `failed` — admin must manually regenerate.

## Photo Source

Only **direct chat** (1:1 admin↔employee) photos are collected. The query filters:

```sql
ChatMessage WHERE
  employeeId = shift.employeeId
  AND status = 'sent'
  AND createdAt BETWEEN shift.startsAt AND shift.endsAt
  AND attachments IS NOT EMPTY
```

Deduplication is by S3 key (same photo forwarded multiple times → one appearance in the report).

**Group chat is not scanned.**

## PDF Output

Generated by `pdfkit` at `apps/worker/src/lib/shift-photo-report/generate.ts`:

1. **Cover page**: Eagle Protect logo, "Guard Shift Photo Report" title, generated date, guard info block, shift info block.
2. **Photo pages**: Each photo centered on its own A4 page, fitted to bounds, with a caption below showing:
   - Guard name
   - Employee number
   - Site name
   - Date & Time (YYYY-MM-DD HH:MM:SS WITA)
3. **Empty shift**: If no photos found, a single page with "No photo evidence submitted during this shift."
4. **Footer** on every page: "Generated: <timestamp WITA> | Page N of M".

## Timezone

All timestamps in the PDF are converted from UTC to `Asia/Makassar (WITA, UTC+8)` for display. The label `WITA` is appended to formatted date/time strings. This is hard-coded in the PDF generator.

## Key Files Reference

| File | Purpose |
|---|---|
| `packages/database/prisma/schema.prisma` | `ShiftPhotoReport` model, `ShiftPhotoReportStatus` enum, Shift columns |
| `packages/database/src/repositories/shift-photo-reports.ts` | All repository functions |
| `packages/database/src/queues.ts` | `SHIFT_PHOTO_REPORT_QUEUE_NAME`, `SHIFT_PHOTO_REPORT_JOB_NAME` |
| `packages/storage/src/s3.ts` | `buildS3ObjectKey` shift-reports branch |
| `apps/worker/src/processors/shift-photo-report.processor.ts` | Worker job |
| `apps/worker/src/lib/shift-photo-report/generate.ts` | PDF generator |
| `apps/worker/src/lib/shift-photo-report/fetch-photos.ts` | S3 photo downloader |
| `apps/worker/src/assets/eagle-protect-logo.png` | Logo (placeholder) |
| `apps/web/lib/data-access/shift-photo-reports.ts` | `getReportById` wrapper (used by the download REST route) |
| `apps/web/app/api/admin/shift-photo-reports/[id]/route.ts` | Download REST endpoint |
| `apps/web/app/admin/(authenticated)/shift-photo-reports/page.tsx` | Existing RSC admin page |
