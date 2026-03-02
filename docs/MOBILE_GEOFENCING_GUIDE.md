# Mobile Geofencing & Location Monitoring Documentation

## Overview
This document describes the implementation of the Background Geofencing and Location Services Monitoring system for the EP Guard Scheduling mobile application. This system ensures that guards remain at their assigned sites and maintain active location services throughout their shifts.

## 1. System Architecture

The system uses a combination of OS-level geofencing (transition-based) and periodic background monitoring to ensure reliability across both Android and iOS.

### Components:
- **Mobile Client (Expo/React Native)**: Handles background tasks, local persistence of breach states, and reporting.
- **Backend API (Next.js)**: Receives reports, manages alert records, and handles automatic resolution.
- **Admin Dashboard**: Real-time visualization and management of geofence-related alerts.

## 2. Data Model Updates

### Site (`Site`)
- **`geofenceRadius`**: A configurable radius (in meters, default: 100) around the site's coordinates. This defines the "safe zone" for the guard.

### Alert Reasons (`AlertReason`)
Two new alert reasons have been introduced:
- **`geofence_breach`**: Triggered when a guard exits the site's geofence and remains outside beyond the grace period.
- **`location_services_disabled`**: Triggered when a guard disables location services or revokes background location permissions.

### Alert Resolution (`AlertResolution`)
- **`auto`**: A new resolution type indicating the alert was resolved automatically by the system (e.g., the guard returned to the site).

## 3. Mobile Background Tasks

Two tasks are registered using `TaskManager` in `apps/mobile/src/utils/backgroundTasks.ts`:

### A. `GEOFENCE_TASK` (Transition-Based)
Triggered by the OS when the device enters or exits a predefined geofence.
- **Exit Event**: Records the exit timestamp in `AsyncStorage`.
- **Enter Event**: Clears breach timers and calls the `/resolve` API to close any open `geofence_breach` alerts.

### B. `LOCATION_MONITOR_TASK` (Periodic Fallback & Heartbeat)
A high-frequency background task (triggered by `expo-location` updates) that ensures constant connectivity.
- **Aggressive Heartbeat**: Calls the `/heartbeat` API approx. every 1 minute. This serves as the primary "alive" signal to the server.
- **Breach Duration Check**: If a `geofence_breach` start time is recorded, it calculates the elapsed time. If it exceeds the grace period, it calls the `/report` API.
- **Service Monitoring**: Checks `Location.hasServicesEnabledAsync()` and permissions. If disabled, it tracks the duration and reports a `location_services_disabled` alert after the grace period.
- **Restoration**: Automatically calls the `/resolve` API (or via heartbeat auto-resolution) when services are restored.

### C. Dead Man's Switch (Server-Side)
Monitored by the `SchedulingProcessor` in the Background Worker.
- **Offline Detection**: If an in-progress shift has not sent a heartbeat for **5 minutes**, the worker triggers a `location_services_disabled` alert.
- **Resilience**: This detects app force-exits, device power-offs, and network disconnects that prevent the mobile app from reporting its state.

## 4. Lifecycle & Resilience Management

Geofencing and heartbeat monitoring are tightly coupled with the shift lifecycle:

1. **Start**: Monitoring is started upon **Attendance (Clock-in)**.
    - **Immediate Startup Alert**: If location permissions or services are denied at the moment of startup, the app sends a `location_services_disabled` alert immediately (skipping the grace period).
2. **Foreground Resumption**: An `AppState` listener in the root layout triggers an immediate location service check whenever the app returns from the background. This detects and reports mid-shift permission revocations instantly.
3. **Re-sync**: The app verifies and restarts monitoring on every app launch if an active shift is found.
4. **Stop**: Monitoring is stopped when the guard completes their **Final Check-in**.

## 5. Configuration & Grace Periods

- **`GEOFENCE_GRACE_MINUTES`** (Default: 5): Grace period for being outside the geofence.
- **`LOCATION_DISABLED_GRACE_MINUTES`** (Default: 2): Grace period for local location service issues.
- **`OFFLINE_THRESHOLD_MINUTES`** (Default: 5): Threshold for server-side "Dead Man's Switch" offline detection.

## 6. API Reference

### `POST /api/employee/shifts/[id]/heartbeat`
Used by the mobile app to report active status.
- **Behavior**: Updates `lastDeviceHeartbeatAt` on the shift and automatically resolves any open `location_services_disabled` alerts for that shift.

### `POST /api/employee/alerts/report`
Reports a security breach from the mobile device.
- **Payload**: `{ "shiftId": string, "reason": "geofence_breach" | "location_services_disabled" }`
- **Broadcast**: Publishes `alert_created` to Redis for real-time dashboard updates.

### `POST /api/employee/alerts/resolve`
Automatically resolves a breach when conditions are restored.
- **Payload**: `{ "shiftId": string, "reason": string }`
- **Broadcast**: Publishes `alert_updated` to Redis.


## 7. Admin Features

- **Site Management**: Admins can adjust the `geofenceRadius` for each site.
- **Security Alert Tab**: A dedicated tab in the Alert Feed for security-related breaches.
- **Audible Alarms**: Security alerts trigger the dashboard's real-time alarm system to ensure immediate response.
