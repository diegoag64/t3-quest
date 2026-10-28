# Validation record

Checked on October 28, 2026, on Apple Silicon macOS.

| Check | Result |
| --- | --- |
| Android debug APK compilation | Passed |
| Android lint | No errors. Remaining warnings concern target API age, legacy backup configuration, and English-only UI strings. |
| Node and DOM tests | 35 passed: authentication, scoped sending, retry deduplication, OpenRouter, Wispr and multipart transcription adapters, draft review, Markdown sanitization, history merge, turn folding, sidebar rendering, same-document navigation, restored list state, and stale-response handling |
| Shell script syntax | Passed |
| APK packaging | Package `dev.t3quest`, minimum API 29, target API 34 |
| Quest installation | Passed on a connected Quest 3. ADB installed the debug APK successfully. |
| Panel launch | Passed. The app process remained running and its log recorded panel creation, resume, and input focus. |
| Beat Saber panel and controller focus | User confirmed that Seamless Multitasking keeps the panel visible and restores game focus. |
| Compact panel dimensions | Quest reports 420 × 480 dp at 200 dpi, matching the new manifest. Previous default was 850 × 700 dp. |
| UI visual review | Browser previews inspected at 1000 × 780 and 420 × 350 CSS pixels, using actual T3 conversation data and the packaged UI. Captures are in ignored `captures/`. |
| Panel navigation on Quest | User confirmed that version 0.3.0 displays threads, but its separate-task transition moves the panel sideways. Version 0.3.1 is installed. The device regression test passed with a live conversation: task, display, window size, WebView instance, and document stayed unchanged through list, thread, and back. |
| Live conversation endpoints | Passed: bounded projection returned 206 rows; history returned 184 rows; full command output hydrated through the read-only item RPC (12,074 characters). |
| USB connection transfer | Passed on Quest. The helper started the demo bridge and the app logged `bridge.configured` after importing its private configuration file. |
| Notifications and microphone during a complete song | Not yet verified. |
| Live T3 pairing and snapshots | Passed against the local T3 desktop server on port 3773. A read-only token exchange succeeded and the protocol-2 snapshot returned 107 threads and 3 projects. |
| Speech-to-text provider | Not configured. Multipart forwarding was tested with a mocked endpoint. |

Reproduce the automated checks from the project directory:

```sh
npm test
npm run build:android -- :app:assembleDebugAndroidTest :app:lintDebug
```

The update check did not start microphone recording. The setup commands selected the installed Node 26 runtime because the default shell Node is 20.8. Use the [headset test guide](headset-test.md) for the remaining device checks.

## Device viewer smoke test

With the headset awake and the paired laptop bridge running:

```sh
.tools/android-sdk/platform-tools/adb install -r app/build/outputs/apk/debug/app-debug.apk
.tools/android-sdk/platform-tools/adb install -r app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
.tools/android-sdk/platform-tools/adb shell am instrument -w dev.t3quest.test/dev.t3quest.ViewerSmoke
```

The separate instrumentation APK opens the production list, clicks its first thread, waits for a real conversation, checks that the composer cannot send an empty draft, and returns to the list twice. It asserts that the parent task ID, display ID, window size, WebView instance, and JavaScript document remain unchanged, and that Back releases the reader. It reports whether a spatial child or the inline fallback was used. Add `-e requireSpatial true` before the runner to fail if the SDK cannot place the child. Physical centering still requires headset review. It saves app-only captures as `files/viewer-compact.png` and `files/viewer-expanded.png` in the target app's private storage. It does not send messages or start a microphone test. Look for `PASS`; a sleeping headset is a timeout, not a passed check.

## Automatic resize investigation

Tested on the connected Quest 3 on October 28, 2026, with Android API 34 and `ro.vros.build.version=209`.

The test-only instrumentation requested 1000 × 780 dp, or 1250 × 975 pixels at the panel's density. The existing panel remained 525 × 600 pixels, or 420 × 480 dp, after both requests:

| Request | Result |
| --- | --- |
| `Window.setLayout(1250, 975)` | View and display dimensions unchanged |
| `ActivityOptions.setLaunchBounds(...)` targeting the existing single-top activity | View and display dimensions unchanged; original activity retained |

Reproduce after installing the Android test APK:

```sh
.tools/android-sdk/platform-tools/adb shell am instrument -w -e resizeProbe true dev.t3quest.test/dev.t3quest.ViewerSmoke
```

The probe restores the original window attributes after the layout request. It runs from the test APK and adds no resizing path to the production app.

Meta's [Layout SDK](https://developers.meta.com/vr/documentation/android-apps/meta-vr-layout-sdk/) and [anchor rules](https://developers.meta.com/vr/documentation/android-apps/meta-vr-layout-anchors/) provide dimensions for supporting spatial windows around the primary window. That is a different window model from resizing this existing primary panel. No documented primary-panel resize method was identified. These results establish that the two tested requests did not work on this headset; they do not prove that every future API or OS version lacks the feature.

The resize probe was performed on version 0.3.1. Version 0.4.0 instead requests a centered Layout SDK child window; it does not resize the primary panel.

## Centered reading-window prototype (0.4.0)

The app now requests a 1000 × 780 dp child window at `WindowAnchor.Center` with `OffsetStep.Near` toward the viewer. No second activity or adjacent-task flag is used. The compact list remains underneath. Placement failure falls back to an in-panel reader.

The debug APK and instrumentation APK compile, lint reports no errors, and all 27 Node/DOM tests pass. The merged manifest includes the SDK declarations and `horizonos.permission.MANAGE_APP_VOLUMETRIC_WINDOWS`. Lint also reports available dependency upgrades; Activity and Compose remain aligned with the Layout SDK's dependency versions.

Installed version 0.4.0 on Quest 3 on October 28, 2026. The device smoke test passed with `-e requireSpatial true`: two open/back cycles used an active Layout SDK child, the reader was wider than the list, Back released it, and the parent task, display, size, WebView, and JavaScript document stayed unchanged. The reader capture is 1250 × 975 pixels; the compact parent remains 525 × 600 pixels at 1.25 density.

Beat Saber was running during the test. A headset capture confirms the compact panel is visible over the game. The user confirmed that the larger reader appears centered and Back restores the compact panel in its original place. External dismissal has not been manually checked. Captures are saved under ignored `captures/layout-sdk-*.png`.

## Visible history regression (0.4.1)

The user reported a blank chat history despite a loaded header and composer. Device diagnostics reproduced it: 251 activity items and 36 rendered entries were present, but both the app root and timeline viewport had zero height inside the 1000 × 780 CSS-pixel child window. Version 0.4.0's test checked DOM presence, which missed the collapsed layout.

The spatial reader's WebView now has explicit `MATCH_PARENT` layout parameters. The HTML fills that viewport and its flex scroller has a zero minimum height. Changing CSS heights alone was tested and did not resolve the issue; the native layout correction did.

Version 0.4.1 is installed on Quest 3. Two open/back cycles passed with a real Layout SDK child: the root measured 780 CSS pixels high, the timeline viewport measured approximately 587 pixels high, and visible entries intersected the viewport at both ends of a scroll. The parent task, display, size, WebView, and document remained unchanged. The tested thread contained 75 activity items and 18 rendered entries. The test also loads older history when pagination is available; this final thread did not require pagination. The corrected capture is `captures/history-fixed-reader.png`.

The test now fails on a collapsed viewport or lack of visible entries, even when history is present in the DOM. Optional `-e layoutProbe true` prints layout metrics without conversation text.

## Voice drafts and scoped sending (0.5.0)

Version 0.5.0 (code 7) is built and installed on the connected Quest 3. Android lint passes with no errors. All 35 Node/DOM tests pass. OpenRouter JSON, Wispr Flow REST and OpenAI-compatible multipart requests are tested with mocked providers, including the audio format and authentication headers. Message tests cover operate-scope enforcement, queued dispatch, persistent retry receipts, uncertain delivery, and rejected arbitrary RPC fields. DOM tests check that transcription does not send a message and that updates preserve an editable draft.

The device test passed with `requireSpatial=true`: two open/back cycles retained the parent panel, the Layout SDK child remained 1000 × 780 CSS pixels, and the history viewport measured about 510 pixels high. The new composer was visible with an empty draft and disabled Send. A separate temporary draft verified persistence and preserved its request ID across an uncertain-delivery state; the test removed only its own temporary draft. The app-only screenshot was visually inspected and saved as `captures/voice-composer-quest.png`. The updated laptop bridge is running with the existing read-only session.

No hosted API key is configured, and the existing T3 pairing is read-only. Live transcription, real message delivery, and microphone capture while Beat Saber has focus remain unverified. The user chose to configure credentials later. No real messages or microphone recording were started by these automated checks.

## Headset-free companion iteration

The overnight iteration adds a synthetic browser preview, T3-compatible pinned/manual ordering, offline labels, linked PRs, and a read-only repository view. `npm test` passes 42 Node/DOM cases. `npm run test:browser` passes ten Chromium cases at 1000 by 780, 420 by 480, and 420 by 350, including narrow PR drawers, offline and empty lists, preserved drafts, and repository errors. Screenshots of each primary view were inspected.

The browser checks exposed two regressions: the compact list lost its scroll position after an inline reader visit, and a short fallback reader left only 68 pixels for history. Both are fixed, with regression assertions. The short-reader check requires more than 120 pixels of visible history.

Live read-only checks validated T3 PR extraction and the fixed GitHub queries using the existing laptop CLI login. One linked repository returned five open PRs and nine open issues with passing, failing, and pending check states. Synthetic tests cover missing access, cached failures, canonical links, request authentication, and stale results. No GitHub mutation or actual thread send was performed.

These overnight changes are not installed or checked on the headset. The installed app remains the previously verified 0.5.0 build. Browser rendering does not prove Horizon OS placement, input focus, or background recording.


## 0.6.0 handoff

Version 0.6.0 (code 8) builds both debug and instrumentation APKs. Final lint has zero errors and 17 warnings. The test suites pass 43 Node/DOM cases and 16 Chromium cases. The final reader pass covers uncached child navigation, visible failed commands, resolved requests, history metadata changes, reconnection, canceled request recovery, streaming scroll position, draft selection, and cached PR aging. Screenshots were inspected at compact, wide, narrow, and short fallback sizes. The build is not installed on Quest.

The restarted laptop bridge returns HTTP 200 for authenticated state and repository reads. It reports Connected, 39 active threads, read-only pairing, and no transcription configuration. The private pairing and bridge token are unchanged. Local commits contain synthetic test data only. No real messages, GitHub mutations, or paid transcription calls were made. Further physical placement, Android resume/focus, and live voice checks are deferred to the headset and credential setup.


## Desktop environment integration

Desktop mode combines enabled environments through T3's existing renderer runtime. Five additional Node tests cover scoped identities, routing of history and tool output, per-environment permissions, disconnect handling, local-origin authentication, and the actual renderer WebSocket transport with synthetic callbacks. All 48 Node/DOM tests pass. The 17 Chromium cases include environment filtering, separate drafts, read-only sending, and revocation of sending while an environment goes offline. The synthetic environment screenshot was inspected and added to the demo set.

The adapter passes scoped web and desktop typechecks and both production bundle builds against the exact installed Nightly tag `v0.1.4-nightly.20261027.3783`, commit `dc84b0962efa`. The build required restoring the lockfile's optional Oxc React compiler binary in ignored build tools. Android debug and instrumentation APK builds and lint pass.

A separate macOS app copy was packaged from that Nightly, with its original server and dependencies, the integrated renderer/main/preload bundles, and an ad-hoc signature that passes `codesign --verify --deep --strict`. Its launcher disables automatic updates and supplies the private loopback link configuration. It does not claim the official signing team's Touch ID entitlements.

The installed Nightly, original T3 source checkout, saved environment catalog, and existing direct bridge were left untouched. Live activation and multi-environment reads remain unverified until the user quits Nightly and launches the prepared copy with the desktop-mode bridge. The copy uses the same Electron profile, so it was not started alongside the active app. No real messages, paid transcription, or headset tests were performed for this change.
