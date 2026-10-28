# T3 Quest Lab

A sideloadable Android panel for testing a T3 Code companion during standalone Beat Saber on Quest 3.

Open Beat Saber, bring up the panel, and start a timed test of alerts and microphone capture. The app saves evidence on the headset. A computer bridge displays live T3 threads and conversations through a scoped pairing. Voice drafts and explicit sending are available after setup.

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

To mirror every environment already connected in your desktop app, use the [desktop integration](docs/connect.md#mirror-your-desktop-environments). It reuses T3's existing connections, including T3 Connect, without pairing each machine again. This requires the integration-enabled T3 desktop build; the stock Nightly app does not expose this companion connection.

For a direct connection to one T3 server, follow these steps.

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

Tap a subagent task card to open its conversation in the same reader. Expand **Worked for…** if the task is folded inside completed work. The back arrow or controller Back returns to the parent, restoring its loaded history, expanded details, and scroll position. Nested tasks work the same way. Drafts remain separate for each thread. At the top-level thread, Back returns to the list. A task without a linked child thread expands its details instead.

The prototype uses Meta's Layout SDK to anchor a 1000 × 780 dp child window to the center of the compact panel. It keeps the original activity and list window. If spatial windows are unavailable, the conversation opens inside the compact panel instead. Horizon OS controls final placement. Centered opening and return to the compact panel were verified on Quest 3 alongside Beat Saber.

The viewer displays user messages, assistant Markdown, code blocks, completed-turn activity folds, command output, diffs, and delegated-task cards. Scroll to the top and choose **Load earlier messages** for older history. Expand activity and choose **Load full output** when T3 has omitted a command result from its snapshot. Live updates preserve your reading position; **Latest ↓** returns to the newest content.

The composer accepts typed or dictated drafts after the setup below. Approvals and edits to existing messages remain on the laptop. Images and file attachments currently appear as labels.

## Voice drafts and sending

Run `npm run setup:voice` on your laptop. Choose OpenRouter, Wispr Flow, OpenAI, or a compatible custom endpoint, then enter your API key without echoing it. Settings stay in the ignored `.env` file. OpenRouter uses your existing credits through its [transcription endpoint](https://openrouter.ai/docs/guides/overview/multimodal/stt), with `microsoft/mai-transcribe-2` as the default; `openai/whisper-large-v3-turbo` and `mistralai/voxtral-mini-transcribe` are alternatives. Wispr Flow requires [approved developer API access](https://api-docs.wisprflow.ai/quickstart); its adapter sends 16 kHz WAV audio using the documented REST API. The OpenAI preset uses `gpt-transcribe`. Custom endpoints must accept multipart `file` and `model` and return JSON with a `text` field.

The earlier pairing is read-only. In T3 Code, create a fresh direct pairing link with permission to operate threads, then run `npm run pair -- --write`. Paste the link in the terminal. Restart the bridge with `npm run connect:quest` (or `npm start` with your LAN address configured).

In a thread, tap **Microphone**, speak, and tap **Stop & transcribe**. Recording starts while the panel is visible and can continue after you return focus to Beat Saber. It stops after 60 seconds. Review or edit the transcript, then tap **Send**. Messages queue behind active work. Recording and transcription never send a T3 message automatically.

Drafts belong to their selected thread and survive closing the reader. Cancel stops dictation; Discard removes a draft. A failed or uncertain send keeps the same retry ID so retrying does not duplicate a message. An uncertain draft is locked until it is retried or discarded. If Quest silences the microphone during gameplay, focus the panel and record again. Background microphone capture during a song still needs device verification.

The API key stays on the laptop. Dictation recordings are deleted after transcription or cancellation; drafts stay in the app’s private storage. The bridge stores only message hashes and delivery receipts for retries.

## Follow pull requests and repository work

Choose **Pull requests** above the thread list to see PRs linked in T3 Code. In a conversation, choose **PRs** to open the side panel. It shows the branch, checks, review status, and a next step based on that evidence. Old snapshots are labeled. Passing checks alone do not mean a PR is ready to merge.

Choose **Repository activity** in the PR panel to load open PRs and recently updated issues from GitHub. The bridge uses the laptop's existing `gh` login. If it is unavailable, run `gh auth login` on the laptop. Repository reads are cached for one minute and restricted to repositories linked to the current thread. The view shows up to three repositories, 20 open PRs per repository, and a bounded issue selection. It labels incomplete or stale results. Issue order reflects recent updates, not priority or an execution queue.

Choose a PR title or **View PR** to open GitHub inside the large reading panel. **Conversation**, **Files**, and **Checks** switch between PR sections. **← Thread** returns to the conversation with its draft and scroll position intact; opening from the compact list returns to **Threads**. The browser reuses the centered reader window. If spatial windows are unavailable, it opens in the existing panel.

Private repositories require signing into GitHub in this view. **Quest Browser ↗** opens the current page in the headset browser if a login flow needs it. The embedded page is the actual GitHub website with its normal controls and a separate web sign-in. Laptop GitHub credentials are not transferred to it.

The summary and repository endpoints only read GitHub. Threads without a linked GitHub PR do not yet have repository discovery.

## Build and connect

- [Build and install the APK](docs/setup.md)
- [Connect the computer bridge and T3](docs/connect.md)
- [Understand the prototype and its limits](docs/architecture.md)
- [Preview and test without a headset](docs/browser-testing.md)

The APK is generated at `app/build/outputs/apk/debug/app-debug.apk`. Node.js 22 or later runs the bridge without runtime npm dependencies. Run `npm ci` to install development dependencies for UI tests. The npm commands use a supported runtime already installed through nvm if the current shell Node is older. `npm test` runs the bridge tests.

## Current scope

- Compact 420 × 480 dp default panel, resizable down to 320 × 300 dp, with a T3-style thread sidebar. A centered Layout SDK child window is requested for reading; Back removes it. Horizon OS controls the displayed placement and size.
- T3 Code dark palette, project badges, branch/provider rows, settled threads, and a read-only conversation timeline, plus separate Connect and Test tabs. Theme attribution is in `THIRD_PARTY_NOTICES.txt`.
- Timed notification, chime, and text-to-speech probes.
- Foreground-service microphone capture, level readings, OS silence detection, and WAV replay.
- Optional transcription through a configured speech-to-text endpoint.
- Direct T3 pairing with the `orchestration:read` permission.
- Completion, failure, and input-request detection from T3 snapshots.

The prototype does not implement wake-word control or T3 Connect cloud sign-in. Sending requires an operate-scoped pairing and an explicit Send action. Headset behavior must be tested on the device. Browser checks and a successful Android build do not establish microphone compatibility with Beat Saber.
