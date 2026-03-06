# Firebase Push Notifications in EP Employee

This document describes the current chat push-notification architecture for the employee mobile app.

## Architecture Overview

**Core Goal:** deliver chat notifications reliably while keeping Firebase Cloud Messaging (FCM) responsible only for transport, and letting the app control all notification UI and tap behavior.

### 1. Database Model (`FcmToken`)

FCM tokens are stored in PostgreSQL via Prisma:
- `employeeId`: the employee that owns the device token.
- `token`: the FCM registration token.
- `deviceInfo`: OS and version metadata for debugging (for example `android 14`).

The table is keyed by the unique token string, so one employee can have multiple active device tokens.

### 2. Mobile App Stack

The mobile app (`com.eagleprotect.employee`) uses:
- `@react-native-firebase/app`
- `@react-native-firebase/messaging`
- `@notifee/react-native`

#### Transport vs UI ownership

- **FCM** delivers **data-only** payloads.
- **Notifee** owns notification UI, Android channel creation, and notification press handling.
- **Expo Router** handles navigation after a notification press.

> [!IMPORTANT]
> **Modular API Standard (v22+):**
> Use the modern React Native Firebase modular API only.
> - Required pattern: `import { getMessaging, getToken, onMessage } from '@react-native-firebase/messaging'`
> - Do not revert to namespaced calls like `messaging().onMessage()`

### 3. Registration Flow (`apps/mobile/src/lib/fcm.ts`)

1. The app calls `requestPermission(getMessaging())`.
2. If permission is granted, the app calls `getToken(getMessaging())`.
3. The token is sent to `POST /api/employee/fcm-token`.
4. `onTokenRefresh(getMessaging(), callback)` re-registers rotated tokens automatically.

### 4. App Notification Flow

#### Bootstrap (`apps/mobile/app/_layout.tsx`)

The app imports the notification bootstrap module at startup so the background message handler and Notifee listeners are registered at module scope.

#### Shared notification module (`apps/mobile/src/utils/chatNotifications.ts`)

This module is the single owner of chat notification display behavior:
- creates the Android `default` notification channel with high importance
- registers `setBackgroundMessageHandler(getMessaging(), ...)`
- converts FCM `data` payloads into local notifications with `notifee.displayNotification(...)`
- stores pending press actions for background launches so the app can navigate after startup

Expected chat payload fields:
- `type: 'chat'`
- `messageId: string`
- `senderName?: string`
- `messagePreview?: string`

#### App lifecycle hook (`apps/mobile/src/hooks/usePushNotifications.ts`)

- **Authentication gating:** setup runs only when a user is logged in.
- **Permission rationale:** if notification permission was denied, the app shows a translated alert and deep-links to system settings.
- **Foreground message handling (`onMessage`)**:
  - reads `remoteMessage.data`, not `remoteMessage.notification`
  - if the app is already on the chat screen, it suppresses all notification UI
  - otherwise it shows the existing in-app toast
- **Notification press handling (Notifee)**:
  - foreground presses are handled through `notifee.onForegroundEvent(...)`
  - cold-start presses are handled through `notifee.getInitialNotification()`
  - background press state persisted by `chatNotifications.ts` is consumed on startup and routed to `/(tabs)/chat`

### 5. Backend Flow (`apps/web/lib/fcm.ts` and `apps/web/lib/socket/chat.ts`)

1. An admin sends a chat message through Socket.IO.
2. The message is saved and emitted to the employee room (`employee:{id}`).
3. The socket server checks room presence with `fetchSockets()`.
4. If the employee has no active sockets, the backend sends a push notification.
5. Firebase Admin sends a multicast **data-only** message to all active tokens.
6. Invalid or unregistered tokens are deleted from the database.

#### Payload design

The backend intentionally does **not** send a top-level FCM `notification` block.

Reason:
- the OS should not render the notification directly
- the app must own notification copy, display timing, channel behavior, and tap routing
- foreground, background, and quit-state behavior should all come from the same app-side logic

Android delivery still uses high priority for reliability.

### 6. Reliability Notes

- **Socket reconnect suppression:** the app already guards against spurious reconnects caused by background wakeups when a push arrives.
- **Foreground suppression:** a user already on the chat screen should not receive a duplicate toast or system notification for the same incoming message.
- **Android channels:** all chat notifications are shown on the `default` Notifee channel with high importance.

## Deployment Requirements

1. `FIREBASE_SERVICE_ACCOUNT_JSON` must be configured in the backend environment.
2. Any change to `@react-native-firebase/*` or `@notifee/react-native` requires a native rebuild.
3. OTA updates alone are not sufficient for native notification-library changes.

## Verification Checklist

- Foreground, non-chat screen: in-app toast appears, no OS notification.
- Foreground, chat screen: no toast and no OS notification.
- Background: a local notification is displayed and tapping it opens `/(tabs)/chat`.
- Killed app: tapping the notification cold-starts the app into `/(tabs)/chat`.
- Invalid FCM tokens are cleaned up by the backend after send failures.
