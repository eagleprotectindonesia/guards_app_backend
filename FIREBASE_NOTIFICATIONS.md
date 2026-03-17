# Firebase Push Notifications in EP Employee

This document describes the current hybrid chat push-notification architecture for the employee mobile app.

## Architecture Overview

**Core Goal:** deliver chat notifications reliably in foreground, background, and killed-app states while preserving app-controlled routing and foreground UX.

### 1. Database Model (`FcmToken`)

FCM tokens are stored in PostgreSQL via Prisma:
- `employeeId`: the employee that owns the device token
- `token`: the FCM registration token
- `deviceInfo`: OS and version metadata for debugging

The table is keyed by the unique token string, so one employee can have multiple active device tokens.

### 2. Mobile App Stack

The mobile app (`com.eagleprotect.employee`) uses:
- `@react-native-firebase/app`
- `@react-native-firebase/messaging`
- `@notifee/react-native`

#### Ownership split

- **FCM/APNs** transport the push and render visible notifications when the app is backgrounded or killed.
- **App code** handles foreground chat UX with an in-app toast.
- **Firebase message data** drives tap routing to chat.
- **Notifee** is still used for Android channel creation and notification settings checks.

> [!IMPORTANT]
> Use the React Native Firebase modular API only.
> - Required pattern: `import { getMessaging, getToken, onMessage } from '@react-native-firebase/messaging'`
> - Do not revert to namespaced calls like `messaging().onMessage()`

### 3. Registration Flow (`apps/mobile/src/lib/fcm.ts`)

1. The app calls `requestPermission(getMessaging())`.
2. The app also checks Notifee notification settings to detect when Android notifications are blocked at the app/settings level.
3. If notifications are enabled, the app calls `getToken(getMessaging())`.
4. The token is sent to `POST /api/employee/fcm-token`.
5. `onTokenRefresh(getMessaging(), callback)` re-registers rotated tokens automatically.

### 4. App Notification Flow

#### Bootstrap (`apps/mobile/index.js`)

The mobile entrypoint imports the notification bootstrap module before Expo Router so Firebase background handlers and Android channel setup are registered as early as possible.

#### Shared notification module (`apps/mobile/src/utils/chatNotifications.ts`)

This module is responsible for:
- creating the Android `chat_messages_v2` notification channel with high importance
- registering the Firebase background handler at module scope
- logging background deliveries for debugging

For chat pushes, it does **not** display a local notification anymore. Background and killed-state display are owned by the OS-rendered FCM/APNs payload.

#### App lifecycle hook (`apps/mobile/src/hooks/usePushNotifications.ts`)

- **Authentication gating:** setup runs only when a user is logged in.
- **Permission/settings fallback:** if notification permission is denied or app-level notifications are blocked, the app shows a translated alert and deep-links to Android notification settings or iOS app settings.
- **Foreground handling (`onMessage`)**:
  - reads `remoteMessage.data`
  - suppresses UX when already on the chat screen
  - otherwise shows the existing in-app toast
- **Tap routing**:
  - `onNotificationOpenedApp(...)` handles taps when the app is backgrounded
  - `getInitialNotification(...)` handles cold-start taps when the app was killed
  - routing uses `data.type === 'chat'` and navigates to `/(tabs)/chat`

### 5. Backend Flow (`apps/web/lib/fcm.ts` and `apps/web/lib/socket/chat.ts`)

1. An admin sends a chat message through Socket.IO.
2. The message is saved and emitted to the employee room (`employee:{id}`).
3. The socket server checks room presence with `fetchSockets()`.
4. If the employee has no active sockets, the backend sends a push notification.
5. Firebase Admin sends a multicast **hybrid** message:
  - visible platform notification content for background/killed rendering
  - `data` payload for routing and app logic
6. Invalid or unregistered tokens are deleted from the database.

#### Chat payload design

Required `data` fields:
- `type: 'chat'`
- `messageId: string`
- `senderName?: string`
- `messagePreview?: string`

Visible notification content:
- **Android:** `notification.title`, `notification.body`, `notification.channelId`
- **APNs:** `aps.alert.title`, `aps.alert.body`, `aps.sound`

This hybrid shape ensures:
- reliable OS-rendered notifications when the app is backgrounded or killed
- app-controlled foreground UX
- consistent routing via `data.type`

### 6. Reliability Notes

- **Socket reconnect suppression:** the app already guards against spurious reconnects caused by background wakeups when a push arrives.
- **Foreground suppression:** a user already on the chat screen should not receive a duplicate toast.
- **Killed-state reliability:** visible notification content is sent from the backend so the OS can display chat pushes even when JS does not wake reliably.
- **Android channels:** chat notifications use the `chat_messages_v2` channel.
- **Channel mutability caveat:** on Android, once a channel has been created on-device, the OS owns that channel's alert behavior. If the user or OEM firmware downgrades it to silent, minimized, or badge-only, recreating the same channel ID from app code will not restore heads-up/system alerts. In that case you must inspect the device's channel settings or ship a new channel ID.

## Deployment Requirements

1. `FIREBASE_SERVICE_ACCOUNT_JSON` must be configured in the backend environment.
2. Any change to `@react-native-firebase/*`, `@notifee/react-native`, or the app entrypoint requires a native rebuild.
3. OTA updates alone are not sufficient for native notification-library changes.

## Verification Checklist

- Foreground, non-chat screen: in-app toast appears and there is no duplicate local notification.
- Foreground, chat screen: no toast and no navigation side effect.
- Background: OS notification appears with the correct title/body and tapping opens `/(tabs)/chat`.
- Killed app: OS notification appears with the correct title/body and tapping cold-starts the app into `/(tabs)/chat`.
- Android notifications disabled: the app detects the blocked state and routes the user to notification settings.
- Invalid FCM tokens are cleaned up by the backend after send failures.
