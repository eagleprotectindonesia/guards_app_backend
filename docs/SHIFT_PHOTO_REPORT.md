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
|---|---|---|---|
| `id` | `String (uuid)` | PK |
| `reportNumber` | `String?` | Human-readable ID (`YYYY-MM-DD-NNNNN`), unique, assigned at creation via daily sequence counter |
| `shiftId` | `String` | FK → `Shift.id` |
| `employeeId` | `String` | FK → `Employee.id` (denormalized for fast listing) |
| `clientId` | `String?` | Denormalized `Site.id` (UUID) at report creation time |
| `shiftStartsAt` | `DateTime` | Snapshot from Shift (WITA context) |
| `shiftEndsAt` | `DateTime` | Snapshot from Shift (WITA context) |
| `status` | `ShiftPhotoReportStatus` | `pending` → `generated` / `failed` / `regenerated` |
| `pdfS3Key` | `String?` | S3 key of the generated PDF |
| `pdfS3Bucket` | `String?` | S3 bucket name |
| `pdfSizeBytes` | `Int?` | PDF file size |
| `photoCount` | `Int` | Number of photos rendered in the PDF — attendance check-in photo (if any) + deduped chat photos |
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

#### Report ID Format

The `reportNumber` column stores a human-readable identifier in the format `YYYY-MM-DD-NNNNN`, where:
- `YYYY-MM-DD` = the date the shift **started** (WITA timezone, resets at WITA midnight)
- `NNNNN` = zero-padded 5-digit daily sequential counter (`00001`–`99999`)

The counter is backed by the `ShiftPhotoReportDailySequence` model (`shift_photo_report_daily_sequences` table). Atomicity is guaranteed by `INSERT ... ON CONFLICT` inside the same transaction that creates the report row.

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
- `fileName`: sanitized (`EP - [Site Name] - [Shift Date] - [HH-mm] to [HH-mm] - RPT[NNNNN].pdf`, e.g. `EP - SLK Cambridge School - 2026-06-28 - 23-00 to 07-00 - RPT00038.pdf`). See `@repo/shared`'s `buildShiftReportDownloadFilename`.

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
| `getOnsiteShiftPhotoReportCandidates(now, graceAfterEndMins?)` | `Shift[]` | Finds `completed` shifts past `endsAt + grace` with no successful report. Includes stale-pending (>30min) and failed. Selects `site` (name, clientName, geofence fields, lat/lng), `shiftType.name`, and `attendance` (picture, recordedAt, metadata) for cover-page assembly. |
| `claimOnsiteShiftPhotoReport(shiftId, now)` | `boolean` | Atomic `updateMany` — sets `autoPhotoReportStatus = pending`. Returns `true` if claimed (another worker didn't). |
| `getShiftReportPhotos({ shift, attendance? })` | `{ messageId, s3Key, createdAt }[]` | Extracts deduped photos from the shift's attendance check-in (if present) and `ChatMessage` messages within the shift's time window. Attendance photo is first. Deduped by S3 key across both sources. |
| `getShiftLocationPoints({ shiftId, employeeId, startsAt, endsAt })` | `ShiftLocationSources` | Returns `{ attendancePoint, checkinPoints, chatPoints }` sourced from `Attendance.metadata.location` (nested `{lat, lng}`), `Checkin.metadata` (flat `{latitude, longitude}`), and `ChatMessage` (flat columns). The structured shape lets the resolver apply different first/last selection rules per source. |
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
| `listShiftPhotoReportsPaginated({ dateFrom?, dateTo?, employeeId?, siteId?, status?, page, pageSize })` | Returns `{ reports, totalCount }`. Reports include `employee` (fullName, employeeNumber) and `shift` (site name). Sorted by `createdAt DESC`. Status accepts a single `ShiftPhotoReportStatus` value. |
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
- Reads `searchParams` filters: `dateFrom`, `dateTo` (filter on `shiftEndsAt`), `employeeId`, `siteId`, `status`, `page`.
- Calls `listShiftPhotoReportsPaginated` directly (no REST call). `clientId` on the report stores the denormalized `Site.id` UUID.
- Computes presigned download URLs inline via `getCachedPresignedDownloadUrl` from `@repo/storage`.
- Renders a table with columns: Report ID (monospace), Status (colored badge), Guard, Site (name + clientName sublabel), Shift window, Photos count, Created date, Actions (download link + regenerate form).
- Includes a Status filter (dropdown with All / Generated / Pending / Failed / Regenerated options) alongside the existing Date, Guard, and Site filters.

**Regenerate**: The page includes a `<form>` that POSTs to a server action. The action calls `createRegeneratedShiftPhotoReport({ originalReportId, adminId })`, then `revalidatePath('/admin/shift-photo-reports')`.

## Sorting

The list supports clickable column headers. URL params: `sortBy`, `sortOrder`.

Whitelisted fields: `site`, `employee`, `reportNumber`. Clicking a column header for the first time sorts ascending. Clicking again toggles to descending.

Unknown `sortBy` values fall back to the default (`createdAt desc`). The repository enforces the whitelist — user input never flows directly into `orderBy`.

## Bulk Download

The shift photo reports list supports multi-select download via a checkbox in the
Actions column. The header Actions cell has a select-all checkbox (with `indeterminate`
state when some-but-not-all are selected).

- Per-row checkbox is disabled for reports without a PDF (status `pending`/`failed`
  or `regenerated` with no `pdfS3Key`).
- Selecting 1+ rows hides the per-row download button and shows a "Download Selected
  (N)" button in the header bar.
- The client fetches each presigned URL, bundles them into a single ZIP via `jszip`,
  and triggers a browser download. ZIP filename: `shift-photo-reports-YYYY-MM-DD.zip`.
- Per-file name inside the zip: `buildShiftReportDownloadFilename` from `@repo/shared` (format: `EP - [Site Name] - [Shift Date] - [HH-mm] to [HH-mm] - RPT[NNNNN].pdf`).
- Atomic: any failed fetch aborts the entire download (no partial zip).
- Selection clears when the user changes filters, sort, or page.

The zip-building logic is extracted to `apps/web/lib/shift-photo-reports/bulk-zip.ts`.

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

Two sources are combined (deduped by S3 key):

### 1. Attendance check-in photo
If the shift has an `Attendance` row with a non-null `picture` (the guard's check-in selfie uploaded from the mobile app), that photo is included as the **first page** of the PDF.

### 2. Direct chat photos
Only **direct chat** (1:1 admin↔employee) photos are collected. The query filters:

```sql
ChatMessage WHERE
  employeeId = shift.employeeId
  AND status = 'sent'
  AND createdAt BETWEEN shift.startsAt AND shift.endsAt
  AND attachments IS NOT EMPTY
```

Each chat message also carries `latitude` and `longitude` columns. When the mobile app sends an image during an active shift, it captures the guard's current location and attaches it to the message. These coordinates are threaded through the worker → PDF pipeline and rendered as a clickable Google Maps link in the photo caption.

Deduplication is by S3 key across both sources. If the same S3 key is also found in a chat attachment, it is rendered only once (at the attendance position).

**Group chat is not scanned.**

## PDF Output

Generated by `pdfkit` at `apps/worker/src/lib/shift-photo-report/generate.ts`. Every page carries the same corporate chrome: a header band (`PT. Eagle Protect International` on the left, `CONFIDENTIAL | RPTxxxxx` on the right), a diagonal `CONFIDENTIAL` watermark, and a long footer (`Confidential | Property of PT. Eagle Protect International | Report ID: RPTxxxxx | Do not share without authorization | Page N of M`).

1. **Cover page (page 1)**:
   - Logo (top, centered) + title block: red `CONFIDENTIAL SECURITY REPORT` caption, bold navy `Guard Shift Security Operations Report` heading, gray italic `Authorized recipients only - Generated by EP ERP` subline.
   - **Report Information** table (4 rows, label/value): Download Filename (`buildShiftReportDownloadFilename` output), Report Number (`RPTxxxxx`), ERP Report ID (`YYYY-MM-DD-NNNNN`), Generated At (WITA).
   - **Shift Details** table (5 rows × 2 label/value pairs): Client (`Site.clientName`), Site (`Site.name`), Shift Date (WITA), Shift (`ShiftType.name`), Shift Start (WITA), Shift End (WITA), Guard, Employee No, Status (`Generated / Ready for review` / `Pending` / `Failed` / `Regenerated`), Time Zone (`WITA (UTC+08:00)`).
   - **Shift Summary** — 1 row of 4 stat cards: Shift Duration (`X hrs` + `HH:MM to HH:MM` subtext), Photos (count + `Photo evidence`), Location Updates (count + `GPS logged`), Incidents (`0` + `No incident reported` — hardcoded). The 2nd-row cards (SOS Alerts, Missed Patrol, GPS Accuracy, Geofence) are intentionally not rendered.
   - **Location Verification Summary** table (5 rows, label/value): Assigned Site, Site Boundary Result (computed: `All N GPS records are within the expected site/escort boundary.` / `M of N GPS records are outside the expected site boundary.` / `Site geofence coordinates are not configured.` / `Geofence monitoring disabled for this site.`), First Location (`HH:MM WITA - <nearest SitePost name> - <lat>, <lng>`), Last Location (same format), Maps Access (fixed sentence).
2. **Photo pages**: Each photo centered on its own A4 page, fitted to bounds, with a caption below showing Guard name, Employee number, Site name, Date & Time (YYYY-MM-DD HH:MM:SS WITA), and Location (latitude, longitude with a Google Maps hyperlink if the chat message carried coordinates). Photos appear in this order:
   - Attendance check-in photo (if present — no location caption since attendance doesn't record coordinates)
   - Chat-sourced photos ordered by `createdAt ASC`
3. **Empty shift**: If no photos found, a single page with "No photo evidence submitted during this shift."

### Location summary computation (`apps/worker/src/lib/shift-photo-report/aggregate.ts`)

Pure helpers used by the processor to derive the cover-page location section:

| Function / Constant | Description |
|---|---|
| `LOCATION_END_GRACE_MINUTES` (= 5) | A shift is treated as "ended by the system" (the auto-completion worker at `shifts.ts`) when no `Checkin` with location occurs within this many minutes before/after the shift's `endsAt`. |
| `haversineMeters(a, b)` | Great-circle distance between two `{latitude, longitude}` points in meters. |
| `nearestPointName(point, posts)` | Returns the `SitePost.name` closest by haversine, or `null` when no posts exist. |
| `resolveNamedPoint(point, posts)` | Produces `ResolvedPoint = { timestamp, pointName, latitude, longitude }`, falling back to `'On Site'` when no posts match. |
| `resolveFirstAndLastLocation(sources, sitePosts, shiftEndsAt)` | Picks the first and last location for the cover page. See the rules below. |
| `summarizeSiteBoundary(points, { sitePosts, latitude, longitude, maxDistanceMeters, geofenceStatusEnabled })` | Returns the human-readable boundary summary string. Matches the boundary check used by the attendance + checkin routes (`findNearestAllowedSiteLocation` in `apps/web/lib/site-post-location.ts`): a point is "within" if it sits within `maxDistanceMeters` of any active `SitePost`. Falls back to the single `Site.latitude`/`Site.longitude` when no posts exist. `maxDistanceMeters` is read from the `MAX_CHECKIN_DISTANCE_METERS` system setting (with env-var fallback). |

#### First / last location rules

- **First location** = the `Attendance` location (timestamp = `recordedAt`) when present. **Fallback** to the earliest `Checkin` (with location) when attendance has no `metadata.location`. Returns `null` if neither source has a location. Chat messages are intentionally **not** used for the first location — the chat stream isn't a reliable start-of-shift signal.
- **Last location** = the latest `Checkin` (with location) whose `at` timestamp is within `endsAt - LOCATION_END_GRACE_MINUTES` to `endsAt + ∞` — i.e. the guard manually checked out near the end of the shift. If no such checkin exists (system-ended shift, or no checkins at all), fall back to the latest `ChatMessage` with non-null lat/lng. Returns `null` when neither source has a location.

`Location Updates` count = `checkinPoints.length + chatPoints.length` (chat messages with `latitude` + `longitude` non-null, plus `Checkin` rows whose `metadata` JSON contains numeric `latitude`/`longitude`). The attendance location is the start-of-shift selfie and is **not** counted as a GPS update.

**Site Boundary distance source**: the `MAX_CHECKIN_DISTANCE_METERS` system setting (env-var fallback) — same value the mobile app reads when the guard records attendance or checkin. Fetched once per report by the processor via `getSystemSetting` (Redis-cached for 1 hour). The "Site Boundary Result" on the cover page therefore matches the threshold the guard actually saw during their shift.

## Timezone

All timestamps in the PDF are converted from UTC to `Asia/Makassar (WITA, UTC+8)` for display. The label `WITA` is appended to formatted date/time strings. This is hard-coded in the PDF generator.

## Key Files Reference

| File | Purpose |
|---|---|
| `packages/database/prisma/schema.prisma` | `ShiftPhotoReport` model, `ShiftPhotoReportStatus` enum, Shift columns |
| `packages/database/src/repositories/shift-photo-reports.ts` | All repository functions (incl. `getShiftLocationPoints`) |
| `packages/database/src/queues.ts` | `SHIFT_PHOTO_REPORT_QUEUE_NAME`, `SHIFT_PHOTO_REPORT_JOB_NAME` |
| `packages/storage/src/s3.ts` | `buildS3ObjectKey` shift-reports branch |
| `apps/worker/src/processors/shift-photo-report.processor.ts` | Worker job — assembles metadata, calls `buildReportMetadata` + `generatePdf` |
| `apps/worker/src/lib/shift-photo-report/generate.ts` | PDF generator (cover page, photo pages, chrome) |
| `apps/worker/src/lib/shift-photo-report/aggregate.ts` | Pure helpers (haversine, nearest SitePost, first/last, geofence summary) |
| `apps/worker/src/lib/shift-photo-report/fetch-photos.ts` | S3 photo downloader |
| `apps/worker/src/assets/eagle-protect-logo.png` | Logo (placeholder) |
| `apps/web/lib/data-access/shift-photo-reports.ts` | `getReportById` wrapper (used by the download REST route) |
| `apps/web/app/api/admin/shift-photo-reports/[id]/route.ts` | Download REST endpoint |
| `apps/web/app/admin/(authenticated)/shift-photo-reports/page.tsx` | Existing RSC admin page |
