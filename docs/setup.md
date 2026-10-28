# Build and install T3 Quest Lab

## Build on Apple Silicon macOS

From the `t3-quest` directory, run:

```sh
python3 scripts/setup-tools.py
npm run build:android
```

The setup script downloads Temurin JDK 17, Gradle 8.11.1, Android platform 35, Android build tools 35, and ADB. It verifies the archives against publisher checksums and extracts them into `.tools`. It writes `local.properties` with the SDK location. It does not install system Java or change shell profiles.

SDK archives contain their upstream license notices. The build uses Android Gradle Plugin 8.9.2, compiles against API 35, and targets API 34. The application uses platform Android APIs without third-party runtime libraries.

Find the debug APK at:

```text
app/build/outputs/apk/debug/app-debug.apk
```

On another operating system, install JDK 17, Gradle 8.11.1, and the same Android SDK packages. Set `JAVA_HOME` and `ANDROID_HOME`, then run `npm run build:android`. You can also open this directory in Android Studio.

## Connect the headset

1. Register and verify a Meta developer account.
2. Enable Developer Mode for the headset in the Meta Horizon phone app.
3. Connect a USB data cable.
4. Put on the headset and accept **Allow USB debugging**.
5. Check the connection:

   ```sh
   bash scripts/quest.sh devices
   ```

The device list must contain a row with the status `device`. If it says `unauthorized`, accept the prompt inside the headset.

6. Install and open the app:

   ```sh
   npm run install:quest
   ```

You can also install the APK through Meta Quest Developer Hub. Find **T3 Quest Lab** in the headset's Unknown Sources app list after installation.

For the current Developer Mode flow, use [Meta's device setup guide](https://developers.meta.com/vr/documentation/unity/unity-software-setup/).

## Inspect diagnostics

Stream the app's log:

```sh
bash scripts/quest.sh logs
```

After a test, copy the latest recording and event log:

```sh
bash scripts/quest.sh collect
npm run report
```

The debug APK permits `adb run-as` for these files. Captures contain audio and thread-independent test diagnostics. The bridge does not save audio uploads.
