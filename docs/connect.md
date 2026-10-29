# Connect your laptop to Quest

Keep T3 Code open on your laptop. Put the laptop and Quest on the same private Wi-Fi network.

## Mirror your desktop environments

Desktop mode shares the enabled environments in the open T3 desktop app. T3 continues to own each LAN, SSH, or T3 Connect connection and its credentials. Quest shows an environment label on each thread and an **All environments** filter. Offline environments retain their last available summaries. Sending follows the destination environment's permissions.

This mode needs an integration-enabled desktop build. Stock T3 Nightly does not include the adapter. No new machine pairing is required, but Quest still needs its existing connection to the laptop bridge.

### Use the prepared macOS copy

1. Quit the ordinary T3 Code app. Open `.tools/Launch T3 Quest Desktop.command` in this checkout. The launcher opens the separate `T3 Code Quest.app` copy with the adapter enabled. It uses the same desktop profile so existing environments remain available.
2. Stop the previous bridge terminal, then start desktop mode at the same laptop address:

   ```sh
   BRIDGE_HOST=192.168.1.20 npm run start:desktop
   ```

   Replace the address with your laptop's address. The bridge token and headset settings stay the same. If you need to transfer settings again, use `T3_QUEST_SOURCE=desktop npm run connect:quest` instead.
3. Install the updated Quest APK with `npm run install:quest`, then open **Threads**. Select **All environments**, or filter by machine.

Keep the integrated desktop app open. Closing it disconnects all environments from Quest. If one environment is unavailable, reconnect it in T3 Code. Desktop mode does not use `.state/t3-session.json` or require an operate-scoped pairing; reviewed sends use that environment's existing desktop permissions.

The local copy is ad-hoc signed, with automatic updates disabled by its launcher. It cannot use T3 Tools' signed Touch ID keychain group. macOS may request Keychain access for the local build. Return to the installed Nightly by quitting the copy and opening the ordinary app. Use `npm start` to restore the single-server bridge.

### Build the desktop integration

Use a separate T3 checkout at the exact revision of your installed app. The adapter was compiled against `v0.1.4-nightly.20261027.3783` (`dc84b0962efa`). From `t3-quest`, run:

```sh
npm run setup:desktop -- --source /path/to/t3code
```

Build that checkout's web and desktop entry points with T3's build tools and its public Clerk and relay configuration. The helper adds the renderer adapter and two Electron hooks; it refuses to overwrite edited integration files. The private local link configuration is saved in `.state/desktop-link.json`.

On macOS, package the built code into a separate copy:

```sh
npm run package:desktop -- --source /path/to/t3code --app '/Applications/T3 Code (Nightly).app'
```

The packaging helper verifies the source revision, retains the installed server and dependencies, replaces the renderer and desktop entry points, and verifies the local signature. It never launches the app or modifies the installed copy. To remove the source hooks, run `npm run setup:desktop -- --source /path/to/t3code --remove` and rebuild T3.

## Pair T3 and transfer the connection over USB

1. In T3 Code, open **Settings → Sharing & access** and create a fresh direct pairing link. If your chosen address needs LAN access, enable **Network access** first.
2. Open a terminal in `t3-quest` and run:

   ```sh
   npm run pair
   ```

3. Paste the pairing link at the prompt. If a `t3code://app/pair` link has no server address, the helper asks for one. For T3 on this laptop at its default port, press Enter to use `http://127.0.0.1:3773`. The terminal reports **Paired**. The bridge requests `orchestration:read` only.
4. Connect Quest by USB and accept its USB debugging prompt.
5. Stop any old bridge terminal and run:

   ```sh
   npm run connect:quest
   ```

6. If the helper lists several addresses, choose the laptop's Wi-Fi address. The helper starts the bridge, transfers the address and token, and opens the Quest panel.
7. In Quest, open **Connect → Check connection**. If a test is running, stop it before applying new settings, then reopen the panel.
8. When the status says **T3 Code connected · read only**, unplug USB if desired. Keep the bridge terminal open.
9. Open **Threads** to see live summaries. Tap a thread for its summary. Use **Test → Start 90s test** to test background alerts during Beat Saber.

If the panel says **Laptop connected · demo**, the bridge is reachable but has no T3 pairing. Run `npm run pair`, stop the bridge with Ctrl+C, and restart `npm run connect:quest`.

For a desktop link such as `t3code://app/pair#token=YOUR_CODE`, you can specify the server first and paste the link at the prompt:

```sh
npm run pair -- --server http://127.0.0.1:3773
```

Use the address of the T3 server that created the link. The `app` part of the desktop URL is not a network address. The default address above is for T3 on the same laptop.

The helper also accepts a quoted URL argument:

```sh
npm run pair -- --server http://127.0.0.1:3773 't3code://app/pair#token=YOUR_CODE'
```

Prefer the prompt to keep the token out of shell history. Add `--write` only when you want to enable reviewed message sending and the pairing permits it. Failed pairing leaves the previous saved session intact. Desktop mode uses its existing environment connections and does not need this command.

If macOS asks for Node network access, allow access on the private network you are using.

To choose an address without a prompt, run:

```sh
npm run connect:quest -- --host 192.168.1.20
```

Replace the address with your laptop's address. For a seated test over USB only, run:

```sh
npm run connect:quest -- --usb
```

Keep USB connected for that route. The helper uses ADB reverse; unplugging the cable disconnects it.

## Connect without the USB helper

1. Pair T3 with `npm run pair` as described above.
2. Start the bridge:

   ```sh
   BRIDGE_HOST=0.0.0.0 npm start
   ```

3. Keep that terminal open. Read the token in another terminal:

   ```sh
   cat .state/bridge-token
   ```

4. In the Quest panel, open **Connect → Manual connection**.
5. Enter a printed laptop address, such as `http://192.168.1.20:8787`, and the bridge token. Do not enter the T3 pairing URL or T3 session token.
6. Tap **Save & check**. The panel reports whether the bridge and T3 are connected separately.

To remove the saved headset connection, tap **Connect → Disconnect laptop**. This does not revoke the bridge's T3 session. Revoke that session in T3's **Sharing & access** settings if needed.

## Test a network notification without T3

1. Run `npm run connect:quest` before pairing with T3. The panel reports **Laptop connected · demo**.
2. Start a headset test and wait for the connection status.
3. In another laptop terminal, run:

   ```sh
   npm run demo:alert
   ```

4. Check whether the thread changes to completed and whether you hear a chime or see a banner.

If the helper binds to a specific address, pass that address to the demo command with `BRIDGE_HOST`, for example `BRIDGE_HOST=192.168.1.20 npm run demo:alert`.

The first connection treats existing events as history. Send the demo event after the connection appears. For a bridge already paired with T3, use an actual thread completion instead.

## Fix a connection problem

- **Desktop link has no server address:** paste the link into `npm run pair`, then enter the T3 server address at the second prompt. The link's `app` host names the desktop UI, not a network server.

- **Cannot reach laptop:** keep the bridge terminal open, check the address, and confirm both devices are on the same Wi-Fi. Check the laptop firewall.
- **Token rejected:** rerun `npm run connect:quest`, or copy `.state/bridge-token` into Manual connection again.
- **Laptop reached, T3 unavailable:** keep T3 running. If access expired, create a fresh link, run `npm run pair`, and restart the bridge.
- **Bridge port already in use:** stop the previous bridge terminal before running the setup helper.
- **USB settings did not apply:** stop the headset test and reopen the panel. If necessary, rerun the helper.

## Use a Tailscale route

A direct T3 pairing URL can point to an endpoint the laptop bridge reaches over Tailscale. The Quest can still reach the bridge over Wi-Fi. T3 Connect cloud sign-in is a different flow and is not implemented in this prototype.

See [T3 remote access](https://github.com/pingdotgg/t3code/blob/main/docs/user/remote-access.md) for direct pairing and network setup.

## Transcribe a recording

1. Configure `TRANSCRIPTION_URL` in `.env` to an endpoint that accepts multipart `file` and `model` fields and returns `{"text":"..."}`.
2. Set `TRANSCRIPTION_MODEL` and `TRANSCRIPTION_KEY` if required by the endpoint.
3. Restart the bridge and check the connection in the panel.
4. Finish a headset recording.
5. Open **Test → Transcribe** and confirm the upload.

Review the returned text in the panel. The prototype does not send replies to T3. Audio leaves the headset only when you request transcription.
