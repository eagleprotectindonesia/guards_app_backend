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

### B. `LOCATION_MONITOR_TASK` (Periodic Fallback)
A high-frequency background task (triggered by `expo-location` updates) that serves as a fallback and handles location service checks.
- **Breach Duration Check**: If a `geofence_breach` start time is recorded, it calculates the elapsed time. If it exceeds the grace period, it calls the `/report` API.
- **Service Monitoring**: Checks `Location.hasServicesEnabledAsync()` and background permissions. If disabled, it tracks the duration and reports a `location_services_disabled` alert after the grace period.
- **Restoration**: Automatically calls the `/resolve` API when location services are restored.

## 4. Lifecycle Management

Geofencing is not active 24/7 to preserve battery. It is tightly coupled with the shift lifecycle:

1. **Start**: Geofencing is automatically started upon a successful **Attendance (Clock-in)**.
2. **Re-sync**: The app verifies and restarts geofencing on every app launch if an active shift with attendance is found.
3. **Stop**: Geofencing is automatically stopped when the guard completes their **Final Check-in** for the shift.

## 5. Configuration & Grace Periods

Settings are managed via `SystemSettings` in the backend and retrieved by the worker/mobile app:

- **`GEOFENCE_GRACE_MINUTES`** (Default: 5): The amount of time a guard can be outside the site before an alert is generated.
- **`LOCATION_DISABLED_GRACE_MINUTES`** (Default: 2): The amount of time allowed for location services to be disabled (e.g., during a reboot) before alerting.
- **Site Radius**: Configurable per site in the Admin Site Form (Min: 10m).

## 6. API Reference

### `POST /api/employee/alerts/report`
Reports a security breach from the mobile device.
- **Payload**: `{ "shiftId": string, "reason": "geofence_breach" | "location_services_disabled" }`
- **Validation**: Verifies the employee is currently assigned to the shift.
- **Broadcast**: Publishes `alert_created` to Redis for real-time dashboard updates.

### `POST /api/employee/alerts/resolve`
Automatically resolves a breach when conditions are restored.
- **Payload**: `{ "shiftId": string, "reason": string }`
- **Outcome**: Updates all active alerts of that type for the shift to `resolvedAt: now` and `resolutionType: auto`.
- **Broadcast**: Publishes `alert_updated` to Redis.

## 7. Admin Features

- **Site Management**: Admins can adjust the `geofenceRadius` for each site.
- **Security Alert Tab**: A dedicated tab in the Alert Feed for security-related breaches.
- **Audible Alarms**: Security alerts trigger the dashboard's real-time alarm system to ensure immediate response.
