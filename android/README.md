# Is It Worth It? for Android

A native Android app (Kotlin, Jetpack Compose) for the Is It Worth It? server. It talks to the REST API at
`/api/v1` and covers:

- **Now playing:** games you're playing, on hold or up next, with progress toward break-even; log hours straight from the list.
- **Library:** search your games, filter by status and sort by name, last played, hours, cost per hour, rating or purchase date.
- **Game page:** hours, net cost, cost per hour, break-even, devices and dates. You can also change the status and log hours.
  When logging hours makes the server suggest a new status (for example backlog → playing), the app offers it.

Everything else (adding games, copies, bundles, PC parts, stats) is still done in the web UI.

## Requirements

- JDK 17: `brew install openjdk@17`
- Android SDK with platform 34. Either install Android Studio (`brew install --cask android-studio`), which sets it up,
  or install just the command-line tools (`brew install --cask android-commandlinetools`) and then run
  `sdkmanager "platforms;android-34" "build-tools;34.0.0" "platform-tools"`.
- `adb` for installing over USB: `brew install --cask android-platform-tools`

Point Gradle at the SDK with `local.properties` (not checked in):

```properties
sdk.dir=/Users/<you>/Library/Android/sdk
```

or set `ANDROID_HOME`. Android Studio does this for you when it opens the `android/` folder.

## Build

```bash
cd android
export JAVA_HOME=/opt/homebrew/opt/openjdk@17
./gradlew assembleDebug
```

The APK ends up at `app/build/outputs/apk/debug/app-debug.apk`. If Gradle's downloads time out on macOS
(Java tries IPv6 first), add `export JAVA_TOOL_OPTIONS=-Djava.net.preferIPv4Stack=true`.

## Install

- **USB:** enable developer options and USB debugging on the phone, connect it, then run
  `adb install -r app/build/outputs/apk/debug/app-debug.apk`.
- **Without a cable:** copy the APK to the phone (or download it from a GitHub release) and open it. Android asks you
  to allow installs from that app (Files, Chrome, …) the first time.

## Set the server URL

On first start the app opens **Settings**. Enter the address of the server on your home network, for example
`http://192.168.1.10:8820` (`http://` is added if you leave it out), then tap **Test** or **Save**. Save also checks the
connection, and it keeps the address even when the server can't be reached, so you can set it up away from home.
You can change the address later on the Settings tab.

- Use the address and port that your Unraid container publishes, the same one you open in the browser.
- The app allows plain HTTP (`app/src/main/res/xml/network_security_config.xml`), because the server is meant for the LAN.
- The server only accepts requests from private networks (`ALLOWED_NETWORKS`), so the phone must be on your Wi-Fi.
- In the Android emulator, `http://10.0.2.2:<port>` reaches a server running on your computer.

## Releases (GitHub Actions)

`.github/workflows/android.yml` builds a release APK on every push or pull request that changes `android/`, and keeps
it as a workflow artifact. When you push a version tag with `scripts/release.sh`, the workflow attaches
`is-it-worth-it-<version>.apk` to that GitHub release, with the version name and code taken from the tag.

Android installs an update over an existing app only if both are signed with the same key. Without signing secrets,
CI signs the APK with a throwaway debug key, so each release would need an uninstall first. For a stable key,
create a keystore once and add it as repository secrets:

```bash
keytool -genkeypair -v -keystore release.jks -alias isitworthit -keyalg RSA -keysize 4096 -validity 10000
base64 -i release.jks | pbcopy   # paste as ANDROID_KEYSTORE_BASE64
```

Secrets: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`isitworthit`) and
`ANDROID_KEY_PASSWORD`. Keep `release.jks` somewhere safe and outside the repository. Locally,
`./gradlew assembleRelease` uses the same environment variables (`ANDROID_KEYSTORE_FILE` pointing at the file)
and otherwise falls back to the debug key.

## Code

- `app/src/main/java/com/isitworthit/app/data/`: the API client (Retrofit + kotlinx.serialization) with models that are
  subsets of `frontend/openapi.json`, plus the saved server URL (DataStore).
- `app/src/main/java/com/isitworthit/app/ui/`: the Compose screens.

When the API changes, update `data/Models.kt` and `data/Api.kt` by hand. Unknown JSON fields are ignored, so new
server fields don't break the app.
