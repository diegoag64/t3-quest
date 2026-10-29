# T3 Quest iteration plan

The user authorized autonomous overnight work on October 28, 2026, with conventional commits. Keep the product focused on understanding threads, reviewing voice drafts, and following pull requests and repository work. Do not expand into a full IDE.

## Acceptance criteria

- The compact list uses T3's project identity, thread title, branch, provider, and status hierarchy. Search, filtering, settled threads, and selection remain stable during refreshes.
- The reader preserves T3's conversation hierarchy: user messages, assistant Markdown, folded work, tool output, subagent links, and visible requests for input. Long content remains readable without horizontal page overflow.
- The reader shows linked PRs with evidence-based status and useful next actions. Repository tracking distinguishes failed checks, pending checks, requested changes, missing reviews, drafts, and merged work. Unknown or stale data must be labeled.
- The production HTML, CSS, and JavaScript run in a repeatable local browser preview with synthetic fixtures. Browser checks cover compact 420 by 480, reader 1000 by 780, and narrow fallback sizes. Screenshots are inspected, with layout and interaction assertions that catch collapsed or obscured history.
- Bridge tests cover authentication, restricted read-only GitHub access, stale data, missing credentials, and request failures. No arbitrary shell arguments or URLs originate from conversation content.
- Voice remains record, review, then Send. Existing drafts and retry identity survive navigation. No tests send real messages or consume transcription credits.
- Node and browser tests pass. Android debug build and lint pass after native or packaged UI changes. Record physical-headset limitations separately.

## Work sequence

1. Commit the existing tested voice feature. Complete: `ba78f6d`.
2. Add a committed synthetic preview and real-browser tests. Complete: `58304dd`. The browser caught a real compact-list scroll reset, fixed in `9bb00d5`.
3. Compare current sidebar and timeline rendering with upstream source. Complete: ordering, loading, empty, offline, stale, and request states are covered. The final reliability pass is committed in `173151b`.
4. Add linked PR visibility and a small read-only repository pipeline using T3 metadata and authenticated GitHub reads where available. Linked PRs are complete in `450f2ed`. The repository reader is complete in `30ec8f0`. Do not infer that work is ready to merge from green CI alone.
5. Exercise edge cases, finish documentation, build the APK, and review the changes. Complete for the scoped 0.6.0 companion; see the handoff below.

## References and constraints

- Workspace: `/Users/diegoarias/Documents/Code/random/t3-quest`.
- Upstream source: `/Users/diegoarias/Documents/Code/t3code`. Read it; do not modify it.
- The installed 0.5.0 app uses a centered Layout SDK child reader. Preserve that behavior and its explicit WebView MATCH_PARENT parameters.
- OpenRouter, Wispr, and OpenAI setup exist. Credentials and write pairing are deferred by the user. Do not request them overnight.
- Use synthetic data in committed fixtures. Never commit real conversation text, `.env`, `.state`, or screenshots containing private data.
- GitHub access is read-only. No comments, merges, issue mutations, or real thread messages are authorized by this iteration task.
- The user authorized local commits. Do not assume this requires pushing every experimental iteration.
- No headset is needed for overnight work. Browser tests verify rendering and behavior, not Horizon OS placement or background microphone capture.

## Continuation

Heartbeat `improve-t3-quest-overnight` resumes this chat every 30 minutes for up to 12 runs. Continue the next unfinished item, update this file with evidence, and avoid repeating passed checks unless changes justify them. Stop and disable the heartbeat when the criteria are met or all remaining work needs unavailable input. Report actual limitations instead of claiming a pixel-identical or device-verified result.

## Evidence

- Voice baseline: 35 Node/DOM tests passed. Android build and lint passed. Version 0.5.0 was installed and its centered-reader navigation, visible history, and temporary draft persistence passed on Quest.
- Live speech recognition and message delivery remain unverified without credentials. Background microphone capture with Beat Saber also remains unverified.
- Headset-free suite covers compact, wide, narrow, and short fallback viewports. Wide, narrow, compact, PR drawer, and repository screenshots were inspected. The current 42 Node/DOM tests pass. Android build and lint pass with the repository native action.
- Live read-only checks found 15 linked PRs across 12 T3 threads. A linked repository returned five open PRs and nine open issues, including passing, failing, and pending checks. No messages, comments, or mutations were sent.
- Pinned/manual active ordering and offline list labels are complete in `e7d6c54`. Narrow PR, empty, and offline browser checks pass. The 420 by 350 fallback test exposed only 68 pixels of history. `a166324` fixes it with a compact-height composer, and the regression now requires more than 120 pixels. All ten browser cases pass and the resulting short-reader screenshot was inspected.
- The final pass below completes the streaming, pagination, freshness, and draft-focus audit. Version 0.6.0 is built without claiming headset verification.
- The verified bridge was restarted at its existing LAN address. Authenticated state and repository reads returned HTTP 200. T3 reports Connected with 39 active threads, read-only scope, and no transcription configuration. The headset still has the previous 0.5.0 installation.
- The six-hour idle-sleep prevention process expires automatically. The improvement heartbeat was stopped after this handoff.

## Final reliability pass

Browser regressions reproduced three defects before the fixes: uncached child navigation retained the previous title, completed commands with a nonzero exit code were folded away, and history-only metadata updates were ignored. The fixes clear the prior thread context, keep failed commands visible, and include pagination metadata in snapshot comparison. Screenshot inspection also caught a retained PR count and a false beginning-of-history label while an uncached thread was offline; both are cleared.

The reader now releases canceled history, output, and repository loading states on resume. Completed input requests are labeled as history. PR evidence ages after five minutes even without another bridge response. Six additional browser cases cover these states plus streaming scroll anchoring, expanded work, draft focus, and text selection. All 43 Node/DOM and 16 Chromium tests pass. Screenshots of failed command output, stale PRs, uncached offline navigation, compact rows, and the short reader were inspected. Android debug and instrumentation APK builds and lint pass; lint has zero errors and 17 warnings.

## 0.6.0 handoff

The scoped acceptance criteria are satisfied by the source comparisons, synthetic behavior and layout tests, inspected screenshots, read-only integration checks, and Android build/lint results above. This is a focused T3-style companion, not a claim of full desktop feature parity or pixel identity. No further unattended implementation is planned. The heartbeat has been disabled.

Version 0.6.0 (code 8) is available at `app/build/outputs/apk/debug/app-debug.apk`. Changes are committed locally; they have not been pushed. The bridge is running with the existing credentials. The centered Layout SDK reader, compact parent, and explicit WebView dimensions remain intact.

Remaining checks require the user: install the new APK and repeat centered open/back, resume, scroll, and controller-focus checks during Beat Saber; configure hosted transcription and an operate-scoped pairing when ready; then verify microphone capture and reviewed sending. No real messages, GitHub mutations, microphone capture, or paid transcription were used during this iteration. Repository discovery still requires a linked GitHub PR, and issue ordering is recent activity rather than an inferred execution pipeline.


## Live desktop environment verification

After the user authorized a restart, the integrated Nightly copy reused the existing profile and connected both enabled environments. The bridge returned 50 threads across the laptop and remote PC. A read-only history request succeeded for each environment. Quest retained its existing bridge address and token.

The device smoke test now accepts `-e requireEnvironments 2`. It filters each connected environment, checks row ownership, opens a thread, and verifies that its history matches the selected scoped ID. The live Quest run passed for both environments, including settled threads, scrolling, stable parent geometry, and reader cleanup. Private screenshots remain ignored. See the final section of [validation.md](validation.md) for the evidence and remaining voice, sign-in, and in-song focus checks.

## Independent T3 Connect prototype

The user requested a separate sign-in experiment before replacing the integrated Nightly copy. `npm run prototype:connect` now supports `login`, `list`, `check`, and `forget`. Its callback uses port 34338, and its credentials and reports stay in ignored `.state/connect-prototype/`. The running bridge, desktop profile, and installed Quest app were not changed.

Live Google sign-in, OAuth refresh, and discovery succeeded. Both existing environments were returned without new machine pairings. Thread verification stopped at relay token exchange with HTTP 401 and `invalid_bearer`. Current upstream source accepts CLI OAuth tokens for discovery but requires a session-template JWT for DPoP connection-token issuance. This boundary is now a synthetic regression case. All 57 Node tests pass, including eight prototype cases. The existing bridge still returned HTTP 200 with both desktop environments connected.

The experiment does not establish that stock Nightly can replace the current setup yet. Continue with a separate supported Clerk interactive session or upstream CLI-token exchange support, then verify live histories and refresh/restart behavior before connecting the Quest UI. See [the prototype guide](connect-prototype.md) for commands and protocol references. No physical-headset test is required for these isolated CLI changes.

## PR viewport and image inspection follow-up

Fixed the reported loss of the lower PR viewport by giving Chromium the Layout SDK child bounds instead of the compact Activity bounds. Added image inspection with zoom, fit, original-size, panning, and return to the same PR position. The compact parent and centered reader behavior remain unchanged.

The installed Quest build passed full-height viewport assertions and native bottom-edge taps at three scroll positions, image enlargement, Close, Android Back, retained thread state, and two reader open/back cycles. All 25 browser tests and 11 Android tests pass, as do lint and both APK builds. Synthetic tests cover image interactions without GitHub access. See [validation.md](validation.md#pr-viewport-and-image-inspection) for the diagnosis, reproducible device command, screenshot limitations, and remaining private-login and in-song checks.
