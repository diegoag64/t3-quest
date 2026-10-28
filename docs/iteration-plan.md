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
2. Add a committed synthetic preview and real-browser tests. Replace private fixture dependence with deterministic data. Inspect screenshots and fix layout regressions.
3. Compare current sidebar and timeline rendering with upstream source. Fix the highest-impact differences and loading, empty, error, and stale states.
4. Add linked PR visibility and a small read-only repository pipeline using T3 metadata and authenticated GitHub reads where available. Do not infer that work is ready to merge from green CI alone.
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
