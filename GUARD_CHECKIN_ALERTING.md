# Guard Check-in & Alerting System Documentation

## Overview
This document outlines the current implementation of the Guard Check-in, Monitoring, and Alerting system in the `ep-guard-scheduling` project. It describes the lifecycle of a shift, the attendance requirement, how check-ins are validated (time & location), how missed events are detected, and how alerts are managed.

## 1. Data Model Core Concepts

### Shift (`Shift`)
Defines the schedule for a guard at a specific site.
- **Key Fields:**
  - `startsAt`, `endsAt`: Shift duration.
  - `requiredCheckinIntervalMins`: Time in minutes between required check-ins.
  - `graceMinutes`: Additional time allowed after the interval before a check-in is considered missed.
  - `lastHeartbeatAt`: Timestamp of the last successful check-in.
  - `missedCount`: Counter for missed check-ins.
  - `status`: `scheduled` | `in_progress` | `completed` | `missed`.
  - `attendance`: Relation to the specific Attendance record.

### Attendance (`Attendance`)
A one-time record marking the start of the guard's presence for a shift.
- **Key Fields:**
  - `recordedAt`: Timestamp.
  - `status`: `present` | `late` | `absent` | `pending_verification`.
  - `metadata`: Geolocation or picture.

### Checkin (`Checkin`)
A recurring record of a guard confirming their presence during the shift.
- **Key Fields:**
  - `status`: `on_time` | `late` | `invalid`.
  - `at`: Timestamp.
  - `metadata`: Geolocation.

### Alert (`Alert`)
Generated when a system event requires admin attention.
- **Key Fields:**
  - `reason`: `missed_checkin` | `missed_attendance`.
  - `windowStart`: The time the event was due.
  - `severity`: `warning` | `critical`.
  - `resolutionType`: `standard` | `forgiven` | `auto`.

## 2. Workflow Description

### A. Monitoring & Detection (`worker.ts`)
A background worker runs continuously to monitor active shifts.

1.  **Sync Cycles**:
    -   **Heavy Sync (30s)**: Refreshes the list of all active shifts (`scheduled`, `in_progress`).
    -   **Light Sync (5s)**: Refreshes status updates for cached shifts.
    -   **Broadcast**: Publishes `active_shifts` and `upcoming_shifts` to Redis for the admin dashboard.

2.  **Attendance Monitoring**:
    -   **Grace Period**: Default 5 minutes from `shift.startsAt`.
    -   **Warning**: Sends a transient "Attention" event if attendance is not recorded and < 1 minute remains in the grace period.
    -   **Alert**: Creates a `missed_attendance` Alert if the grace period passes without an Attendance record.

3.  **Check-in Monitoring**:
    -   Calculates check-in windows using `calculateCheckInWindow`.
    -   **Warning**: Sends a transient "Attention" event if the window is `open` but < 1 minute remains.
    -   **Alert**: Creates a `missed_checkin` Alert if the window status becomes `late` and no check-in occurred.

### B. Guard Workflow

#### 1. Attendance (`/api/employee/shifts/[id]/attendance`)
Before performing routine check-ins, a guard must record attendance.
-   **Validation**:
    -   **Location**: Validates distance against `MAX_CHECKIN_DISTANCE_METERS` relative to Site coordinates.
    -   **Uniqueness**: Can only be recorded once per shift.
-   **Outcome**:
    -   Creates `Attendance` record.
    -   Updates Shift status to `in_progress`.

#### 2. Check-ins (`/api/employee/shifts/[id]/checkin`)
Guards perform recurring check-ins based on the shift's interval.
-   **Window Logic (`lib/scheduling.ts`)**:
    -   **Open**: Current time is within `[SlotStart, SlotStart + Grace]`.
    -   **Early**: Current time is before the next slot.
    -   **Late**: Grace period has passed for the current slot.
    -   **Completed**: A valid check-in already exists for the current slot.
-   **Validation**:
    -   **Time**: Rejects check-ins if status is `early`, `late`, or `completed`.
    -   **Location**: Validates distance against `MAX_CHECKIN_DISTANCE_METERS`.
-   **Outcome**:
    -   Creates `Checkin` record.
    -   Updates `shift.lastHeartbeatAt`.
    -   **Auto-Resolution**: Automatically resolves any open `missed_checkin` alert for this shift.

### C. Admin Real-time Dashboard (`/api/admin/alerts/stream`)
Admins monitor operations via a Server-Sent Events (SSE) stream.

1.  **Data Feeds**:
    -   **Alerts**: Real-time creation and updates of alerts.
    -   **Active Shifts**: Live status of all ongoing shifts (syncs with worker).
    -   **Upcoming Shifts**: Rolling list of shifts starting in the next 24 hours.
2.  **Alert Management**:
    -   **Resolve**: Mark as handled.
    -   **Forgive**: Soft delete (restores guard's performance stats).

## 3. API Reference

### `POST /api/employee/shifts/[id]/attendance`
records the initial presence for a shift.
-   **Body**: `{ "location": { "lat": number, "lng": number } }`
-   **Checks**: Distance <= `MAX_CHECKIN_DISTANCE_METERS`.

### `POST /api/employee/shifts/[id]/checkin`
Records a routine check-in.
-   **Body**: `{ "location": { "lat": number, "lng": number }, "source": "web" }`
-   **Response**: `{ "checkin": object, "next_due_at": ISOString, "status": "on_time" }`
-   **Checks**: Distance, Time Window.

### `POST /api/admin/alerts/[id]/resolve`
-   **Body**: `{ "outcome": "resolve" | "forgive", "note": "string" }`