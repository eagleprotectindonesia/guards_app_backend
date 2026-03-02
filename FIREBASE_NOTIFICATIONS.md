# Firebase Push Notifications in EP Employee

This document outlines the technical architecture for the Firebase Cloud Messaging (FCM) integration used to send push notifications to the mobile app (specifically for chat messages).

## Architecture Overview

**Core Goal:** Deliver a push notification to a guard's mobile device when an admin sends a chat message, *unless* the guard is currently active in the chat view.

### 1. Database Model (`FcmToken`)

FCM tokens are stored in the PostgreSQL database via Prisma:
- **`employeeId`**: Which employee this token belongs to.
- **`token`**: The actual FCM registration string.
- **`deviceInfo`**: OS and version info for debugging (e.g. `android 14`).

*Design Note:* The table is keyed by the unique `token` string, meaning one Employee can have multiple active tokens (e.g., if they log in on two different phones).

The mobile app (`com.eagleprotect.employee`) uses `@react-native-firebase/app` and `@react-native-firebase/messaging` (v23+).

> [!IMPORTANT]
> **Modular API Standard (v22+):**
> This project has been migrated to the modern **Modular API**. Do NOT revert code to the legacy namespaced API (e.g., avoid `messaging().onMessage`).
> - **Mandatory:** Use functional imports: `import { getMessaging, getToken, onMessage } from '@react-native-firebase/messaging'`.
> - **Rationale:** React Native Firebase v22+ officially deprecated the namespaced pattern. Reverting to legacy syntax will re-introduce deprecation warnings and break compatibility with future v24+ TypeScript enhancements.

**Registration Flow (`src/lib/fcm.ts`):**
1. App calls `requestPermission(getMessaging())` to ensure the user has authorized notifications (required for Android 13+).
2. App calls `getToken(getMessaging())` to retrieve the device FCM token.
3. The token is sent to the backend `POST /api/employee/fcm-token`.
4. A background listener `onTokenRefresh(getMessaging(), callback)` ensures that if Firebase rotates the token, the backend is immediately updated.

**App Lifecycle Hook (`src/hooks/usePushNotifications.ts`):**
- **Authentication**: The setup only runs if the `user` is currently logged in.
- **Permission Rationale**: If the user previously denied push permissions, the app uses a custom `AlertContext` (`showAlert`) to display a translated rationale dialog that deep-links to system settings.
- **Foreground Handling (`onMessage`)**: If the app is actively open when a push arrives, it suppresses the system notification and instead shows an in-app toast using our custom UI components.
- **Background Taps (`onNotificationOpenedApp` & `getInitialNotification`)**: If the user taps a system notification from the OS tray, the router intercepts the payload (`{ type: 'chat' }`) and navigates directly to the `/(tabs)/chat` screen.

### 3. Backend (Next.js & Serverless Workers)

**Authentication & Registration:**
The endpoint `POST /api/employee/fcm-token` is protected by the unified Next.js `proxy.ts`. It upserts the provided token against the authenticated `employeeId`.

**Firebase Admin SDK (`lib/firebase-admin.ts`):**
Initialized dynamically using the `FIREBASE_SERVICE_ACCOUNT_JSON` environment variable. 

**Push Logic (`lib/fcm.ts` & `lib/socket/chat.ts`):**
1. An admin sends a message via Socket.IO.
2. The message is saved to the DB and emitted to the Socket.IO room (`employee:{id}`).
3. **Presence Detection**: The socket server checks `io.in(room).fetchSockets()`.
4. **Conditional Push**: If the result is exactly `0` (meaning the employee is offline or in the background and their socket dropped), the backend calls `sendChatPushNotification()`.
5. **Multicast**: The utility fetches all registered tokens for that employee and sends a multicast request via Firebase Admin.
6. **Token Cleanup**: If Firebase returns an error indicating a token is no longer registered (`messaging/invalid-registration-token` or `registration-token-not-registered`), the backend proactively deletes that record from the database to maintain hygiene.

### 4. Important Reliability Fixes

- **Socket Reconnect Suppression**: Received notifications in the background could trigger a spurious socket reconnection because FCM briefly wakes the app into an `inactive` state. The `AppState` listener in `src/api/socket.ts` now specifically tracks transitions from `background` to `active` to ignore these brief wakeups.
- **Translation Support**: All user-facing notification permission rationale strings are localized in English and Indonesian via `@repo/shared/src/locales`.
- **FCM Reliability (Android)**: Backend payloads specifically include `priority: 'high'` and a `channelId: 'default'` for better delivery on modern Android devices.

## Deployment Requirements

1. **Environment Variables**:
   `FIREBASE_SERVICE_ACCOUNT_JSON` must exist in the production environment variables containing the stringified JSON payload of the Firebase Service Account.
2. **Native Builds**:
   Because `@react-native-firebase/*` involves native Java/Kotlin code, the mobile app cannot rely purely on over-the-air (OTA) Expo updates for this feature. A native build (`eas build`) is required whenever the Firebase packages are updated.
