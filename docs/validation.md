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


## Embedded GitHub PR browser

PR titles and View PR now open the live GitHub website in the existing centered reader. Native controls provide Conversation, Files, Checks, reload, page history, and a return to the retained thread or compact list. The inline fallback uses the existing activity. The thread WebView stays mounted, with its controller paused while the browser is visible. External browser launch remains an explicit action.

All 48 Node/DOM and 17 Chromium tests pass. Browser tests verify distinct PR/thread actions and draft preservation. Eight local Android tests pass: four URL-policy cases and four Robolectric browser cases covering section navigation, explicit return, blocked local URLs, absence of the T3Quest interface, load-error recovery, and explicit external-browser handoff. Android debug and instrumentation builds and lint pass with zero errors and 20 warnings. The refreshed PR and repository screenshots use synthetic data and were inspected.

The native website is a separate WebView with no T3 JavaScript interface or laptop credentials. It uses its own GitHub web login; the live website retains normal GitHub controls. Tests do not sign in, load private PRs, post comments, or send thread messages. Live GitHub rendering, login compatibility, controller focus, and return navigation during Beat Saber still require a headset check. Robolectric verifies native logic without rendering the remote website, and browser screenshots show the PR summary UI rather than a headset capture.


## Quest installation and live PR check

Installed the app from commit `8b6bb68` on Quest 3 by USB, preserving settings and drafts. The device smoke test passed two open/back cycles with a 1000 by 780 CSS-pixel Layout SDK reader, about 510 pixels of visible history, working pagination, and unchanged parent task, display, bounds, and document.

A read-only PR probe opened the public t3-quest PR on GitHub in the headset WebView, visited Conversation, Files, and Checks, verified that the website has no T3Quest interface, and returned to the same reader with its draft and scroll position preserved. The app-only screenshot was inspected locally. The installed compact sidebar also exposed 11 live linked PR cards, and its View PR action opened the browser. Private GitHub sign-in and in-song controller focus remain untested. No recording, message, or GitHub mutation was performed.

The user later authorized the desktop restart. The integration-enabled Nightly copy opened the existing profile and reconnected both enabled environments without new pairing. The desktop bridge returned 50 threads: 31 from the laptop and 19 from the remote PC. All 19 PC threads were settled. Read-only history requests returned HTTP 200 for a thread from each environment. The bridge now runs in desktop mode on the existing port 8787, so Quest keeps its saved address and token. The integrated desktop app remains open.

The device smoke test with `-e requireSpatial true -e requireEnvironments 2` passed on Quest. It selected each environment through the UI filter, checked that every listed row belonged to that environment, opened a thread, and matched the loaded history to the selected scoped thread ID. Both readers displayed live, scrollable history at 1000 by 780 CSS pixels with about 510 pixels of conversation height. Back preserved the parent task, display, dimensions, and document. The test restored All environments afterward. Local screenshots were inspected and remain ignored because they contain private threads. The first attempt timed out while Quest was asleep; waking it resolved that test setup failure.

The test performed no actual thread sends, recordings, paid transcription, or GitHub mutations. Private GitHub sign-in, in-song controller focus, and live voice remain unverified. Desktop mode requires the integrated T3 copy and the desktop bridge to stay running; launching stock Nightly alone does not enable the companion link.

## Command history folding correction

The reader previously promoted every command failure to a red row outside the completed turn's work group. T3 folds failures that precede the final assistant reply. Quest now follows that rule, keeping the command and its output inside the expandable work details. Failures after the final reply remain visible. This supersedes the earlier failed-command visibility behavior described above.

A read-only check confirmed that the reported command was marked failed within a completed run, before its final reply. The full 18-case browser suite passed after the fix. The final focused run passed three cases covering completed commands with failure exits, explicit failed status, and failures after the final reply. Synthetic screenshots were inspected. The Android build passed, the updated APK was installed on Quest, and the device test passed history reads from both connected environments with stable parent geometry and reader cleanup. No real messages or recordings were sent.


## Subagent conversation navigation

Linked subagent cards already opened child histories through environment-scoped IDs. The reader now keeps a bounded parent path within the current panel. Both the header arrow and Android Back return to the parent before closing the reader. Parent history, expanded work, and scroll position are restored while the controller refreshes the thread. Switching to an unrelated sidebar thread clears the parent path. Drafts remain stored per thread.

The full 48-test Node suite, 21 browser tests, and eight Android unit tests passed. A subsequent project-lookup regression brings the Node suite to 49 cases; all six desktop protocol tests pass after that fix. Browser coverage includes nested children absent from the sidebar, simulated live child updates, separate drafts, loaded parent history, scroll restoration, child errors, and unrelated navigation. The synthetic child-reader screenshot was inspected. Both Android APKs build successfully.

The update is installed on Quest. The opt-in device probe with `-e requireSubagent true -e threadId <parent-id>` clicked a real subagent card, loaded its history, and invoked Android Back. It verified the same reader WebView remained mounted and the parent ID, draft, and scroll position returned. The surrounding smoke test passed two open/back cycles with unchanged compact parent geometry and visible history. The private device capture was inspected locally and stays ignored. The test sent no messages and made no recordings.

The final live child check also exposed a missing project label for subagents absent from the sidebar. Desktop mode now resolves their project from the child projection within the same environment. The private Android software capture clipped its output, so the viewport was checked independently through the debug WebView: 1000 by 780 CSS pixels, the header at the top, and the footer at the bottom.
