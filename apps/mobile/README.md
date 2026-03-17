# Mobile App

## Local Android build

Use this when you do not want to spend EAS cloud build credits.

### Prerequisites

- Java 17
- Android Studio with Android SDK installed
- `ANDROID_HOME` or `ANDROID_SDK_ROOT` set
- SDK packages installed:
  - `platform-tools`
  - `build-tools`
  - at least one Android platform matching the installed SDK

Typical Linux shell setup:

```bash
export ANDROID_SDK_ROOT="$HOME/Android/Sdk"
export ANDROID_HOME="$ANDROID_SDK_ROOT"
export JAVA_HOME="/usr/lib/jvm/java-17-openjdk-amd64"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
```

On this Ubuntu machine, install Java 17 first:

```bash
sudo apt-get update
sudo apt-get install -y openjdk-17-jdk unzip wget
```

Then bootstrap the Android SDK as your user:

```bash
cd apps/mobile
bash scripts/setup-android-sdk.sh
```

To persist the environment in your shell:

```bash
cat apps/mobile/scripts/android-env.sh >> ~/.bashrc
source ~/.bashrc
```

### Fast local APK build

This regenerates the native Android project from Expo config, then builds a debug APK locally with Gradle.

```bash
cd apps/mobile
pnpm run android:build:preview
```

Available variants:

- `pnpm run android:build:development`
- `pnpm run android:build:preview`
- `pnpm run android:build:production`

APK output:

```bash
apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

Notes:

- These scripts use `assembleDebug`, so they do not require a release keystore.
- `APP_VARIANT` controls app name, package suffix, and which `google-services*.json` file is used.
- Because `/android` is gitignored, `expo prebuild --clean` is safe and expected here.
- Treat `/ios` the same way: if you generate it locally, regenerate it for the target variant instead of relying on stale native files.
- `expo run:android` and local Gradle builds require a locally installed Android SDK, as described in Expo's local development guide: https://docs.expo.dev/guides/local-app-development/

## iOS variant workflow

Expo config is the source of truth for iOS bundle identifiers, app name, APNs environment, and Firebase plist selection.

- `EAS_BUILD_PROFILE` takes precedence over `APP_VARIANT`
- if an `ios/` folder exists, EAS will prefer the native Xcode project and ignore `ios.bundleIdentifier` from Expo config
- because `/ios` is generated, the safe workflow is to remove it and prebuild it again for the variant you want

Production example:

```bash
cd apps/mobile
pnpm run native:clean
pnpm run ios:prebuild:production
eas build --profile production --platform ios
```

For a local native iOS run:

```bash
cd apps/mobile
pnpm run native:clean
pnpm run ios:production
```

### Local EAS build

If you want output closer to cloud EAS behavior, run EAS locally on your own machine:

```bash
cd apps/mobile
pnpm run android:build:eas-local:preview
```

Available variants:

- `pnpm run android:build:eas-local:development`
- `pnpm run android:build:eas-local:preview`
- `pnpm run android:build:eas-local:production`

### Install on a connected device or emulator

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

### Common failure points

- `SDK location not found`: set `ANDROID_HOME` or `ANDROID_SDK_ROOT`
- `JAVA_HOME is not set correctly`: point `JAVA_HOME` to Java 17
- `google-services file missing`: verify the matching `google-services*.json` file exists for the selected variant
