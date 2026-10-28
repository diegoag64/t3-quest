# Test the panel without a headset

The browser preview loads the production Quest HTML renderer, styles, and icons. Synthetic threads simulate native callbacks. It does not connect to your laptop bridge, capture audio, or send messages.

## Run the checks

Install dependencies with `npm install`. Install the test browser once:

```sh
node scripts/run-node.mjs node_modules/@playwright/test/cli.js install chromium
```

Run `npm run test:browser`. The 16 Playwright cases check the compact list, expanded reader, narrow and short fallbacks, history scrolling, draft review, navigation, streaming focus, canceled-load recovery, and stale PR evidence. The clock-driven freshness test runs without waiting five real minutes. Screenshots and failure traces are saved under ignored `test-results/`. Open the HTML report with `node scripts/run-node.mjs node_modules/@playwright/test/cli.js show-report`.

## Inspect a layout

Run `npm run preview`, then open `http://127.0.0.1:8790` in a browser. Use browser developer tools to set the viewport to 420 by 480 for the list or 1000 by 780 for the reader.

Use `/?mode=reader` for a conversation, `/?mode=reader&scenario=offline` for a disconnected reader, `/?mode=reader&scenario=long` for long content, and `/?scenario=empty` for an empty list. The microphone button simulates recording. Stopping it supplies a synthetic draft. Send only clears that preview draft.

## Limits

Chromium checks layout and JavaScript behavior. It cannot establish Horizon OS window placement, controller focus, Android service lifecycle, or microphone capture over Beat Saber. Keep the separate Android build, lint, and device smoke checks for those layers. Review screenshots after changes instead of accepting a screenshot solely because a test saved it.
