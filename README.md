# T3 Quest Lab

A sideloadable Android panel for testing a T3 Code companion during standalone Beat Saber on Quest 3.

Open Beat Saber, bring up the panel, and start a timed test of alerts and microphone capture. The app saves evidence on the headset. A computer bridge displays live T3 threads and conversations through a read-only pairing.

## Run the first test

1. Enable Developer Mode on the Quest.
2. Connect a USB data cable and accept the headset's USB debugging prompt.
3. Install the built APK from this directory:

   ```sh
   npm run install:quest
   ```

4. Open Beat Saber, then press the Meta button and reopen **T3 Quest Lab** from the app library inside the game.
5. Open **Test**, tap **Start 90s test**, and grant microphone and notification permissions. No laptop connection is required.
6. Enable **Seamless Multitasking** and click the game outside the panel to return controller focus.
7. Listen for the chime at 25 seconds. Say a distinctive phrase around 50 seconds.
8. After 90 seconds, return to the panel and open **Test → Replay**.

The [headset test guide](docs/headset-test.md) covers the visual notification, spoken cue, hidden-panel test, and evidence collection.

## Connect your laptop

In T3 Code, create a fresh direct pairing link under **Settings → Sharing & access**. In a terminal inside `t3-quest`, run:

```sh
npm run pair
```

Paste the link at the prompt. Connect Quest by USB and run:

```sh
npm run connect:quest
```

The helper starts the bridge and transfers the address and token to Quest. Keep the terminal open. Once the panel shows **T3 Code connected · read only**, you can unplug USB and use Wi-Fi.

The **Connect** tab repeats these steps and provides a manual connection option. **Threads** updates while the panel is resumed. Background alerts run during a timed headset test.

## Read a thread

Tap a thread in **Threads** to request a larger reading window centered just in front of the compact list. The back arrow closes the reader and reveals the list, preserving its search and scroll position. Use the sidebar button in the conversation header to switch threads within the same reader.

The prototype uses Meta's Layout SDK to anchor a 1000 × 780 dp child window to the center of the compact panel. It keeps the original activity and list window. If spatial windows are unavailable, the conversation opens inside the compact panel instead. Horizon OS controls final placement. Centered opening and return to the compact panel were verified on Quest 3 alongside Beat Saber.

The viewer displays user messages, assistant Markdown, code blocks, completed-turn activity folds, command output, diffs, and delegated-task cards. Scroll to the top and choose **Load earlier messages** for older history. Expand activity and choose **Load full output** when T3 has omitted a command result from its snapshot. Live updates preserve your reading position; **Latest ↓** returns to the newest content.

The composer is a read-only display of the thread's model, reasoning effort, and mode. Replies, approvals, edits, and voice submission remain on the laptop. Images and file attachments currently appear as labels.

## Build and connect

- [Build and install the APK](docs/setup.md)
- [Connect the computer bridge and T3](docs/connect.md)
- [Understand the prototype and its limits](docs/architecture.md)

The APK is generated at `app/build/outputs/apk/debug/app-debug.apk`. Node.js 22 or later runs the bridge without runtime npm dependencies. Run `npm ci` to install development dependencies for UI tests. The npm commands use a supported runtime already installed through nvm if the current shell Node is older. `npm test` runs the bridge tests.

## Current scope

- Compact 420 × 480 dp default panel, resizable down to 320 × 300 dp, with a T3-style thread sidebar. A centered Layout SDK child window is requested for reading; Back removes it. Horizon OS controls the displayed placement and size.
- T3 Code dark palette, project badges, branch/provider rows, settled threads, and a read-only conversation timeline, plus separate Connect and Test tabs. Theme attribution is in `THIRD_PARTY_NOTICES.txt`.
- Timed notification, chime, and text-to-speech probes.
- Foreground-service microphone capture, level readings, OS silence detection, and WAV replay.
- Optional transcription through a configured speech-to-text endpoint.
- Direct T3 pairing with the `orchestration:read` permission.
- Completion, failure, and input-request detection from T3 snapshots.

The prototype does not send messages to T3, implement wake-word control, or implement T3 Connect cloud sign-in. Headset behavior must be tested on the device. A successful Android build does not establish compatibility with Beat Saber.
