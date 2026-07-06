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
2. If the shift has a `groupShiftId` with a linked `GroupChat`, resolve the group chat ID.
3. Fetch photos concurrently from:
   - **Direct chat** (`ChatMessage` with `status='sent'`, `employeeId = shift.employeeId`, `createdAt` between shift start/end, `attachments` non-empty)
   - **Group chat** (same filters on `GroupChatMessage` scoped to the shift's linked group, if one exists)
   Deduplicate by S3 key across all sources.
4. Download photo buffers from S3.
5. Create a `ShiftPhotoReport` row with `status = pending`.
6. Generate the PDF via pdfkit (cover page + per-photo pages with captions).
7. Upload PDF to S3.
8. Mark report as `generated`.
9. On any error: mark as `failed`. Resets the Shift claim to `null` if no report row was created (next tick retries).

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
| `getShiftReportPhotos({ shift, attendance?, groupChatId? })` | `ShiftPhoto[]` (see shape below) | Extracts deduped photos from the shift's attendance check-in (if present), `ChatMessage` (direct chat) messages within the shift's time window, and optionally `GroupChatMessage` (group chat) when `groupChatId` is provided. Attendance photo is first. Deduped by S3 key across all sources. Also returns `content` (chat message text) and `attendanceMatchedName` (from `attendance.metadata.matchedLocation.name`) for the per-photo evidence page. |
| `getShiftLocationPoints({ shiftId, employeeId, startsAt, endsAt, groupChatId? })` | `ShiftLocationSources` | Returns `{ attendancePoint, checkinPoints, chatPoints }` sourced from `Attendance.metadata.location` (nested `{lat, lng}`), `Checkin.metadata` (flat `{latitude, longitude}`), `ChatMessage` (flat columns), and optionally `GroupChatMessage` (merged into `chatPoints` when `groupChatId` is provided). The structured shape lets the resolver apply different first/last selection rules per source. |
| `resetShiftPhotoReportClaim(shiftId)` | `boolean` | Resets `autoPhotoReportStatus` to `null` for crash recovery (when error occurs before report row is created). |

`ShiftPhoto` (return type of `getShiftReportPhotos`):

| Field | Type | Notes |
|---|---|---|---|
| `messageId` | `string` | `"attendance"` for the attendance photo, otherwise the `ChatMessage.id` or `GroupChatMessage.id` |
| `s3Key` | `string` | S3 object key (used for dedupe and download) |
| `createdAt` | `Date` | Source timestamp (attendance `recordedAt`, `ChatMessage.createdAt`, or `GroupChatMessage.createdAt`) |
| `latitude` | `number \| null` | `null` for the attendance photo |
| `longitude` | `number \| null` | `null` for the attendance photo |
| `content` | `string \| null` | Trimmed `ChatMessage.content` or `GroupChatMessage.content` (always `null` for the attendance photo). Surfaced as the "Remarks" field on the per-photo page. |
| `attendanceMatchedName` | `string \| null` | Parsed from `attendance.metadata.matchedLocation.name`. Non-null only for the attendance photo. Used as a fallback for the "Location Name" when the post can't be derived from coordinates. |

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
**Direct chat** (1:1 admin↔employee) photos are always collected. The query filters:

```sql
ChatMessage WHERE
  employeeId = shift.employeeId
  AND status = 'sent'
  AND createdAt BETWEEN shift.startsAt AND shift.endsAt
  AND attachments IS NOT EMPTY
```

### 3. Group chat photos
If the shift belongs to a **Group Shift** (`groupShiftId` is non-null) and that group shift has a linked **Group Chat**, photos sent by the same guard in that group chat are also collected:

```sql
GroupChatMessage WHERE
  groupId = <resolved group chat id>
  AND employeeId = shift.employeeId
  AND status = 'sent'
  AND createdAt BETWEEN shift.startsAt AND shift.endsAt
  AND attachments IS NOT EMPTY
```

Group chat messages that lack a direct `employeeId` (e.g. messages sent by admins) are not included — only messages authored by the shift's assigned guard.

Each chat message (direct or group) also carries `latitude` and `longitude` columns. When the mobile app sends an image during an active shift, it captures the guard's current location and attaches it to the message. These coordinates are threaded through the worker → PDF pipeline and rendered as a clickable Google Maps link in the photo caption.

Deduplication is by S3 key across all sources. If the same S3 key appears in attendance, direct chat, and group chat, it is rendered only once (at the attendance position).

## PDF Output

Generated by `pdfkit` at `apps/worker/src/lib/shift-photo-report/generate.ts`. Every page carries the same corporate chrome: a header band (`PT. Eagle Protect Security` on the left, `CONFIDENTIAL | RPTxxxxx` on the right), a diagonal `CONFIDENTIAL` watermark, and a long footer (`Confidential | Property of PT. Eagle Protect Security | Report ID: RPTxxxxx | Do not share without authorization | Page N of M`).

1. **Cover page (page 1)**:
   - Logo (top, centered) + title block: red `CONFIDENTIAL SECURITY REPORT` caption, bold navy `Guard Shift Security Operations Report` heading, gray italic `Authorized recipients only - Generated by EP ERP` subline.
   - **Report Information** table (4 rows, no heading): Download Filename (`buildShiftReportDownloadFilename` output), Report Number (`RPTxxxxx`), ERP Report ID (`YYYY-MM-DD-NNNNN`), Generated At (WITA).
   - **Shift Details** table (5 rows × 2 label/value pairs, no heading): Client (`Site.clientName`), Site (`Site.name`), Shift Date (WITA), Shift (`ShiftType.name`), Shift Start (WITA), Shift End (WITA), Guard, Employee No, Status (`Generated / Ready for review` / `Pending` / `Failed` / `Regenerated`), Time Zone (`WITA (UTC+08:00)`).
   - **Shift Summary** — 1 row of 4 stat cards: Shift Duration (`X hrs` + `HH:MM to HH:MM` subtext), Photos (count + `Photo evidence`), Location Updates (count + `GPS logged`), Incidents (`0` + `No incident reported` — hardcoded). The 2nd-row cards (SOS Alerts, Missed Patrol, GPS Accuracy, Geofence) are intentionally not rendered.
   - **Location Verification Summary** table (5 rows, label/value): Assigned Site, Site Boundary Result (computed: `All N GPS records are within the expected site/escort boundary.` / `M of N GPS records are outside the expected site boundary.` / `Site geofence coordinates are not configured.` / `Geofence monitoring disabled for this site.`), First Location (`HH:MM WITA - <nearest SitePost name> - <lat>, <lng>`), Last Location (same format), Maps Access (fixed sentence).
2. **Photo pages**: Each photo gets a dedicated **evidence card** on its own A4 page, with the following layout (top → bottom):
   - **Title row**: `Photo Evidence #<i> - <Location Name> | Location Verified` (or `Location Unavailable` when no coordinates). The location name is the post name resolved at generation time.
   - **Two-column body** (image on the left, map on the right):
     - **Left** — the photo embedded in a 58%-width column, with a dark bottom overlay strip showing `Photo Evidence #<i> - <post name>` and `Captured <YYYY-MM-DD HH:MM:SS WITA> | <chat text or "Sample visual">`. An "EP APP" badge is anchored in the top-right corner of the image.
     - **Right** — a 42%-width Google Static Maps image (centered on the photo's lat/lng) with a red marker dot, a "GPS location verified" tooltip near the marker, a "Map Preview" tag in the top-right corner of the map frame, and a blue underlined `Open location in Google Maps` link underneath. If the API key is missing or the call fails, the map area gracefully falls back to a stylized placeholder (tan fill, light road lines) — the rest of the page still renders.
   - **Detail table** (8 rows, full content width):
     - `Captured At` → `formatTZ(photo.createdAt) WITA`
     - `Uploaded At` → `formatTZ(photo.uploadedAt) WITA` (falls back to `createdAt` if the S3 `LastModified` header is missing; `fetch-photos.ts` reads it from the `GetObjectCommand` response)
     - `Location Name` → post name (see "Per-photo enrichment" below)
     - `Latitude` / `Longitude` / `Coordinates` → 6-decimal lat/lng, hyperlinked to Google Maps; `-` when no coordinates
     - `Geofence Status` → `Inside assigned site boundary` / `Outside assigned site boundary` / `Geofence monitoring disabled for this site.` / `Site geofence coordinates are not configured.` / `-` (no location)
     - `Remarks` → trimmed `ChatMessage.content` if the photo came from a chat message, otherwise `-`

   **Excluded fields (by design)**: `GPS Accuracy`, `Distance from Site`, `Device`, `Network`. The reference card design surfaces only the location + message content the guard's chat app captured at capture time.

   Photos appear in this order:
   - Attendance check-in photo (if present — left column shows the attendance picture, right column shows the "Location not recorded" placeholder because the attendance record doesn't carry coordinates)
   - Chat-sourced photos ordered by `createdAt ASC`
3. **Empty shift**: If no photos found, a single page with "No photo evidence submitted during this shift."
4. **Movement Summary page** (last page, only when the shift has ≥1 location point): a dedicated page that visualizes the guard's path across the site. Skipped entirely when no location data is available.
   - **Title row**: `Location Trail - N Updates` (24pt bold navy), where N = number of merged location points.
   - **Map area** (full content width × 300pt): a Google Static Maps PNG with the following overlays:
     - **Site boundary** (auto-fit to the union of site posts + trail): a 2pt navy rectangle with translucent navy fill (2+ posts), a single marker (1 post), or a circle around the legacy `Site` center when no posts exist. Suppressed entirely if no posts and no center.
      - **Trail polyline**: a 5pt blue line connecting every location point in chronological order.
      - **Robust autozoom**: the map's `center` + `zoom` are derived from `computeTrailBoundingBox({ trailPoints, sitePosts })` (see helpers below). Outlier trail segments (length > 5× median) have both endpoints dropped from the bbox so a single noisy GPS fix or a long one-time trip doesn't force the map to zoom way out. The full polyline still renders the outlier (it appears at the edge of the frame).
      - **Directional arrows**: a filled white triangle (navy outline) overlaid on each polyline segment (≥18px long), pointing in the direction of travel. Composited onto the base map server-side via `sharp` (no new npm deps) using Web Mercator projection at the same `center` + `zoom` that built the static map. Skipped automatically when the trail has <2 points or when `center`/`zoom` are missing. Best-effort: if compositing fails, the unannotated base map is still returned.
      - **Numbered markers**: a white-filled navy-outlined circle per location point with the sequence number (1..N) inside. Rendered as an SVG overlay composited via `sharp` in the same pipeline as arrows. When two or more markers overlap (projected pixel distance < 28 px), the labels are **staggered** — each offset by 14 px away from the cluster centroid (or radially when all points share nearly the same pixel), with a thin navy leader line back to the real coordinate. Google's static map draws a small blue `size:tiny` dot at each coordinate, and our SVG adds the numbered circle and leader lines. Edge-clamping prevents labels from being pushed off the image.
     - **Map Preview** badge (top-right) and an **Assigned Site Boundary** tooltip (top-left, with the trail update count).
      - **Scale bar** (bottom-right): a 60pt line with endcaps labeled `approx. 50 m`.   The number is a heuristic — accurate at zoom 20 with a 640×480 image (the size emitted after Google's 640px-per-axis cap). With the MIN_BBOX_SPAN_DEG = 0.00009 (~10 m) floor, very tight clusters can now zoom to building level (zoom 20). If you change the image size or zoom, recompute via the mercator formula in `bboxToZoomLevel`.
   - **Timeline table** (8 columns × up to 18 rows, plus a `+X more updates` footer row if the trail is longer):
      - `#` (sequence number), `Time` (`HH:MM` WITA), `Type` (`Attendance` / `Check-in` / `Photo evidence`), `Area` (resolved post name or site name), `Coordinates` (6-decimal lat/lng), `Distance` (meters to nearest post, rounded; `<1 m` or `-`), `Remarks` (chat text or `-`).
   - **Graceful fallback**: if no `GOOGLE_MAPS_STATIC_API_KEY` is configured (or the request fails), the map area renders the same stylised placeholder used by the per-photo evidence page (tan fill + light road lines). The rest of the page (title, table, footer) still renders.

#### Movement trail computation (`apps/worker/src/lib/shift-photo-report/aggregate.ts`)

Pure helpers used by the processor to build the trail:

| Function | Description |
|---|---|
| `buildLocationTrail(sources, sitePosts, { siteName, siteCenter })` | Merges the attendance, checkin, and chat-message location points into a single chronologically sorted list, assigning a 1-based `seq`, a `type` (`'attendance'` \| `'checkin'` \| `'photo'`), a resolved `area` name (nearest post for multi-post sites, site name otherwise), `accuracyMeters` (read from `Checkin.metadata.accuracy` / `Attendance.metadata.accuracy`; `null` for chat-typed points), `distanceFromNearestPostMeters` (haversine to each post, taking the min; falls back to `siteCenter` if no posts), and `remarks` (chat text, when present). |
| `computeBoundingBox(points)` | Returns `{ minLat, maxLat, minLng, maxLng }` enclosing the points with 20% padding. Returns `null` for an empty input. |
| `findOutlierTrailIndices(trailPoints, threshold?)` | Returns the set of trail-point indices whose adjacent segment is `> threshold × median(segmentLengths)` (default threshold = 5). **Both** endpoints of every outlier segment are included in the returned set. With fewer than 2 trail points or when the median is 0 (all points coincide), the returned set is empty. |
| `computeTrailBoundingBox({ trailPoints, sitePosts, threshold? })` | Bbox of site posts + non-outlier trail points, used by the processor to compute the map's `center` and `zoom`. Site posts are always included; trail endpoints flagged as outliers (by `findOutlierTrailIndices`) are dropped. The full polyline is still drawn on top of the map using all trail points, so outlier movements remain visible (just at the edge of the frame). Returns `null` for empty input. |
| `bboxCenter(bbox)` | Midpoint of the bounding box. |
| `bboxToZoomLevel(bbox, imageWidth, imageHeight)` | Computes a Google-Maps zoom level (integer in `[1, 20]`) that fits the bounding box into the given image dimensions using the standard mercator formula. The `MIN_BBOX_SPAN_DEG = 0.00009` (~10 m) floor allows tight clusters to resolve to zoom 20. |
| `trailPointTypeLabel(type)` | Maps a `TrailPointType` to the canonical label shown in the timeline table. |

#### Trail map fetch (`apps/worker/src/lib/shift-photo-report/static-map.ts`)

| Function | Description |
|---|---|
| `buildSiteBoundaryPath({ sitePosts, siteCenter, siteRadius })` | Returns a Google Static Maps `path=` fragment for the site boundary (rectangle for ≥2 posts, point for 1 post, circle around `siteCenter` for 0 posts + radius, `null` otherwise). |
| `buildTrailPath(points)` | Returns a Google Static Maps `path=` fragment for the polyline (`color:0x2563eb\|weight:5\|…`). Returns `null` for fewer than 2 points. |
| `buildNumberedMarkers(points)` | Returns a multi-line `markers=` fragment with one `size:tiny` blue dot per point (no label — the sequence number is rendered in the SVG overlay). |
| `buildTrailMapUrl({ trailPoints, sitePosts, siteCenter, siteRadius, center, zoom, width, height, apiKey })` | Composes the final Google Static Maps URL with `size`, `center`, `zoom`, `path` (boundary + trail), and `markers` (numbered waypoints) parameters. |
| `fetchTrailMapPng({ ... })` | Fetches the PNG, then automatically composites directional arrows on top and numbered markers on top of those. Width and height are clamped to 640px per axis (Google's Maps Static API hard limit) before building the URL, so the returned image always matches the SVG overlay dimensions. Same 5s timeout, env-key resolution, and `null`-on-failure contract as `fetchStaticMapPng`. |
| `projectTrailToPixels({ trailPoints, center, zoom, imageWidth, imageHeight })` | Projects lat/lng trail points to image-pixel space using Web Mercator at the supplied zoom. Aligns with where Google actually rendered the points on the PNG so arrowheads land on the polyline. |
| `buildArrowOverlaySvg(pixels, imageWidth, imageHeight, style?)` | Returns an SVG string with one filled `<polygon>` (triangle) per qualifying polyline segment. Skips segments shorter than `style.minSegmentPx` (default 18). The triangle is rotated to match the segment direction. |
| `overlayDirectionArrows({ mapBuffer, trailPoints, center, zoom, imageWidth, imageHeight, style? })` | Composites the arrow SVG onto an existing map PNG using `sharp`. **Reads the actual buffer dimensions via `sharp.metadata()`** — if Google returned a smaller/clamped image, the SVG is created at the real buffer size, not the requested size. Returns the original buffer unchanged when there are <2 trail points, when `center`/`zoom` is missing, or when compositing fails. |
| `planMarkerPlacement({ trailPoints, center, zoom, imageWidth, imageHeight })` | Projects trail points to pixel space and detects overlapping pairs (< 28 px apart). Returns an array of `MarkerPlacement` objects with staggered `labelX`/`labelY` coordinates for overlapping markers (offset by 14 px away from the cluster centroid), plus a `leaderLine` if staggered. Single markers and non-overlapping pairs are returned unstaggered. Edge-clamping ensures no label circle is pushed off the image. |
| `buildNumberedMarkersSvg(placements, imageWidth, imageHeight, style?)` | Builds an SVG string with a white-filled navy-outlined circle + bold navy sequence number per placement, and a thin navy leader line (`<line>`) for any staggered placement. |
| `overlayNumberedMarkers({ mapBuffer, placements, imageWidth, imageHeight, style? })` | Composites the numbered-marker SVG onto an existing map PNG using `sharp`. Uses the same defensive `sharp.metadata()` dimension-read pattern as `overlayDirectionArrows`. No-op (returns input) when placements are empty or compositing fails. Pipeline order in `fetchTrailMapPng`: base → arrows → numbered markers. |

#### Per-photo enrichment (worker side)

The processor enriches each raw `ShiftPhoto` with location metadata before the S3 download (see `apps/worker/src/processors/shift-photo-report.processor.ts:89-123`):

- **`locationName`** → `resolveLocationName(point, attendanceMatchedName, sitePosts, site.name)`:
  1. **Attendance photo** → `attendanceMatchedName` (the post name pre-resolved at check-in time).
  2. **Multi-post site** (≥2 posts) + photo has lat/lng → nearest `SitePost.name` by haversine.
  3. **Any other case** (0 posts, 1 post, no coordinates, out-of-range point) → the **site name** (e.g. `"Lilu Rental"`), so every photo gets a meaningful geo-anchor even when no SitePost is nearby.
  4. **Defensive fallback** (if site name is also missing) → `"On Site"`.
- **`geofenceStatus`** → `computeGeofenceStatus(point, geofenceContext)` returning one of `inside` / `outside` / `disabled` / `unconfigured` / `no-location`. Uses the same `MAX_CHECKIN_DISTANCE_METERS` system setting that the mobile app reads, and applies the same site-post fallback chain as the cover page's "Site Boundary Result".
- **`chatContent`** → `ChatMessage.content` (trimmed) for chat-sourced photos; `null` for the attendance photo.
- **`attendanceMatchedName`** → mirrored from the raw photo (used as the `locationName` fallback when no coordinates are present).

These enriched fields are passed through `PhotoInput` → `fetchPhotos` → `FetchedPhoto` and rendered by the PDF generator without any further DB lookups.

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
| `computeGeofenceStatus(point, { sitePosts, latitude, longitude, maxDistanceMeters, geofenceStatusEnabled })` | Per-photo check used by the photo evidence page. Returns a discrete label: `'inside'`, `'outside'`, `'disabled'` (geofence off for the site), `'unconfigured'` (no posts + no site center, or `maxDistanceMeters = 0`), or `'no-location'` (point is null). |
| `geofenceStatusLabel(status)` | Maps a `GeofenceResultLabel` to the human-readable string rendered in the evidence table. |
| `resolveLocationName(point, attendanceMatchedName, sitePosts)` | Resolves the post name shown in the evidence page title/caption: `"Main Site"` for a single-post site, else nearest post by haversine, else the stored `attendanceMatchedName`, else `"On Site"`. |

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
| `packages/database/src/repositories/shift-photo-reports.ts` | All repository functions (incl. `getShiftLocationPoints`, `getShiftReportPhotos`) |
| `packages/database/src/queues.ts` | `SHIFT_PHOTO_REPORT_QUEUE_NAME`, `SHIFT_PHOTO_REPORT_JOB_NAME` |
| `packages/storage/src/s3.ts` | `buildS3ObjectKey` shift-reports branch |
| `apps/worker/src/processors/shift-photo-report.processor.ts` | Worker job — assembles metadata, enriches per-photo data (post name + geofence), calls `buildReportMetadata` + `generatePdf` |
| `apps/worker/src/lib/shift-photo-report/generate.ts` | PDF generator (cover page, evidence card photo pages, chrome) |
| `apps/worker/src/lib/shift-photo-report/aggregate.ts` | Pure helpers (haversine, nearest SitePost, first/last, geofence summary, per-photo geofence + location name, location trail, bbox/zoom math) |
| `apps/worker/src/lib/shift-photo-report/fetch-photos.ts` | S3 photo downloader (passes through enriched fields: `locationName`, `geofenceStatus`, `chatContent`, `attendanceMatchedName`, `uploadedAt`) |
| `apps/worker/src/lib/shift-photo-report/static-map.ts` | Google Static Maps PNG fetcher — per-photo (5s timeout) and trail map (boundary + polyline + numbered waypoints); falls back to `null` on error |
| `apps/worker/src/assets/eagle-protect-logo.png` | Logo (placeholder) |
| `apps/web/lib/data-access/shift-photo-reports.ts` | `getReportById` wrapper (used by the download REST route) |
| `apps/web/app/api/admin/shift-photo-reports/[id]/route.ts` | Download REST endpoint |
| `apps/web/app/admin/(authenticated)/shift-photo-reports/page.tsx` | Existing RSC admin page |
