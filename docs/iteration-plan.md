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
3. Compare current sidebar and timeline rendering with upstream source. Fix the highest-impact differences and loading, empty, error, and stale states.
4. Add linked PR visibility and a small read-only repository pipeline using T3 metadata and authenticated GitHub reads where available. Linked PRs are complete in `450f2ed`. The repository reader is complete in `30ec8f0`. Do not infer that work is ready to merge from green CI alone.
5. Exercise edge cases, finish documentation, build the APK, and review the changes. Make coherent `feat:`, `fix:`, `test:`, and `docs:` commits.

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
- Next: audit loading/error recovery and remaining source differences, especially streaming updates, history pagination, PR freshness, and draft focus. Inspect baseline screenshots and add focused regression cases for actual gaps. Finish with a version bump to 0.6.0 and an APK build, without claiming headset verification.
- The running laptop bridge has not been restarted with these overnight changes yet, and the headset still has the previous 0.5.0 installation. Restart the verified project bridge at the end if useful; avoid requiring USB or waking the headset.
- An idle-sleep prevention process is running for six hours (exec session 12091). Heartbeat remains active for the next quality passes.

## Final reliability pass

Browser regressions reproduced three defects before the fixes: uncached child navigation retained the previous title, completed commands with a nonzero exit code were folded away, and history-only metadata updates were ignored. The fixes clear the prior thread context, keep failed commands visible, and include pagination metadata in snapshot comparison. Screenshot inspection also caught a retained PR count and a false beginning-of-history label while an uncached thread was offline; both are cleared.

The reader now releases canceled history, output, and repository loading states on resume. Completed input requests are labeled as history. PR evidence ages after five minutes even without another bridge response. Six additional browser cases cover these states plus streaming scroll anchoring, expanded work, draft focus, and text selection. All 43 Node/DOM and 16 Chromium tests pass. Screenshots of failed command output, stale PRs, uncached offline navigation, compact rows, and the short reader were inspected. Android debug and instrumentation APK builds and lint pass; lint has zero errors and 17 warnings.
