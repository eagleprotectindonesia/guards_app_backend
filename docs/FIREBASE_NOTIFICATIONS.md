# Firebase Push Notifications in EP Employee

This document describes the hybrid chat push-notification architecture for the employee mobile app and employee PWA.

## Architecture Overview

**Core Goal:** deliver chat and leave-status notifications reliably while preserving app-controlled routing and foreground UX.

### 1. Database Model (`FcmToken`)

FCM tokens are stored in PostgreSQL via Prisma:
- `employeeSessionId`: session that owns the token
- `token`: FCM registration token (unique)
- `deviceInfo`: platform metadata for debugging

A single employee can have multiple active tokens across devices/sessions (mobile + web).

### 2. Platform Ownership Split

- **FCM/APNs/WebPush transport** delivers notification payloads.
- **Mobile app code** controls foreground UX (toast/in-app flow).
- **Employee PWA code** controls foreground UX (toast + sound) and token registration.
- **Firebase message data** drives routing behavior.

### 3. Employee Mobile Flow

Mobile (`apps/mobile`) uses `@react-native-firebase/*` + Notifee:
- permission request
- token registration to `POST /api/employee/fcm-token`
- token refresh re-registration
- `onMessage` foreground handling
- background/killed notification display via platform payload

### 4. Employee PWA Flow

Employee PWA (`apps/web/app/employee`) uses Firebase Web Messaging:
- push setup runs in authenticated employee scope
- registration is gated to **standalone PWA mode**
- browser permission requested after authenticated employee session is ready
- token obtained via `getToken(..., { vapidKey, serviceWorkerRegistration })`
- token registered to `POST /api/employee/fcm-token`
- token rotation removes old token and re-registers new token
- foreground messages use in-app toast + sound

### 5. Backend Flow (`apps/web/lib/fcm.ts` and `apps/web/lib/socket/chat.ts`)

1. Admin sends chat via Socket.IO.
2. Message is saved and emitted to employee room.
3. Server checks room presence with `fetchSockets()`.
4. If employee has no active sockets, backend sends FCM push.
5. Multicast payload includes:
   - platform notification content (Android/APNs)
   - data payload for app logic/routing
   - `webpush.fcmOptions.link` for web notification click target
6. Stale tokens are deleted when delivery fails with invalid/unregistered token errors.

Leave-status notifications follow the same token and stale-cleanup flow.

### 6. Required Environment Variables

Backend:
- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `WEB_APP_URL`

Web client (`apps/web`):
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `NEXT_PUBLIC_FIREBASE_VAPID_KEY`

### 7. Verification Checklist

- Mobile foreground chat: app toast behavior remains intact.
- Employee PWA standalone: permission prompt appears after auth; token saved.
- Employee PWA standalone background/closed: OS notification appears.
- Notification click opens the correct route:
  - chat -> `/employee/chat`
  - leave -> `/employee/leave-requests`
- Invalid tokens are cleaned up by backend after failed sends.
