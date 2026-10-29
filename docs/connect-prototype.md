# Test T3 Connect independently

This probe signs in through T3's official hosted authorization page and lists the environments linked to that account. It uses separate credentials and does not switch the Quest bridge, modify Nightly, or read the desktop profile.

## Sign in and check environments

Run these commands from the repository root with Node 22 or later. The launcher also finds a suitable Node installation under `~/.nvm`.

1. Start the callback listener:

   ```sh
   npm run prototype:connect -- login
   ```

2. Open the printed URL in Chrome or another browser. Sign in with the account used by T3 Nightly. The listener accepts one callback on `127.0.0.1:34338` and expires after ten minutes. If the port is occupied, finish the other T3 login before retrying.

3. List account-linked environments:

   ```sh
   npm run prototype:connect -- list
   ```

4. Attempt read-only thread verification:

   ```sh
   npm run prototype:connect -- check
   ```

   Each environment receives its own result. A verified result includes the shell thread count, project count, and the number of visible items in one sampled thread. An empty environment has no sampled history. A failed result names the stage and HTTP status. The command exits with status 1 if any environment remains unverified.

The private report is `.state/connect-prototype/report.json`. Credentials are in `.state/connect-prototype/credentials.json`, with file mode `0600` inside a `0700` directory. Refresh tokens rotate in that file. These files are excluded from git. Credentials are stored as local plaintext and are not copied to the headset. Run one prototype command at a time.

To remove the prototype's local credentials, run:

```sh
npm run prototype:connect -- forget
```

This removes only the local copy. It does not revoke the OAuth grant or delete the report. It leaves the existing bridge token, direct pairing, and desktop integration credentials unchanged.

## Interpret the current result

The live test on October 28, 2026 completed Google sign-in through the official hosted page. Discovery returned both environments already visible in the desktop app. OAuth refresh and discovery with the refreshed token also succeeded. Neither machine needed a new pairing or account link.

Thread verification failed before connecting to either environment. The production relay returned HTTP 401 with `auth_invalid` and `invalid_bearer` when exchanging the CLI OAuth token for a DPoP connection token. The latest upstream source explains the distinction:

- [`verifyRelayClientBearerToken`](https://github.com/pingdotgg/t3code/blob/main/infra/relay/src/http/Api.ts) accepts either session JWTs or CLI OAuth tokens for account-level requests such as environment discovery.
- `layerTokenApi` in that same file calls `verifyClerkBearerToken` directly. It requires a session-template JWT with the relay audience for connection-token issuance.

The CLI login therefore proves account discovery, not thread access. Keep the existing desktop integration running. The next authentication experiment needs a separate supported Clerk interactive session, as used by T3's browser or desktop clients, or upstream support for CLI OAuth tokens in the relay token exchange. Do not extract a session from the installed app or weaken the relay's token validation.

Do not switch back to stock Nightly until the independent client can read histories from both environments, refresh credentials, recover after a restart, and serve the Quest UI. Environment discovery does not include LAN-only or SSH-only entries that have never been linked to T3 Connect.

## Protocol and test boundaries

The probe uses the public OAuth client configuration in upstream [`.env.example`](https://github.com/pingdotgg/t3code/blob/main/.env.example) and the [hosted PKCE flow](https://github.com/pingdotgg/t3code/blob/main/packages/shared/src/connectAuth.ts). It contains no client secret. Public source-build configuration is described in [T3 Connect setup](https://github.com/pingdotgg/t3code/blob/main/docs/operations/connect-setup.md).

The connection experiment uses `t3-web`, an existing public protocol client identifier. Upstream currently accepts only `t3-web` and `t3-mobile`. This is a compatibility experiment, not a registered Quest client or a claim of a stable third-party API. Environment sessions are labeled `T3 Quest Connect prototype` and request only `orchestration:read`. The client rejects unexpected scopes, insecure endpoints, and mismatched environment identities. Relay and environment DPoP credentials remain in memory for the duration of each check.

Only authentication exchanges and read-only shell/history requests are implemented. The probe does not send messages, change environment links, expose a new tunnel, modify GitHub, or request transcription. Reports omit conversation text and credentials.

Run the synthetic coverage with:

```sh
node scripts/run-node.mjs --test tests/connect-prototype.test.mjs
npm test
```

Coverage includes PKCE state and callback validation, ES256 DPoP signatures and token binding, refresh rotation, private credential storage, two-environment reads, identity and scope rejection, and the live-observed distinction between discovery and connection authorization. Synthetic connection success is not evidence of live thread access.
