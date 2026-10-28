# Connect your laptop to Quest

Keep T3 Code open on your laptop. Put the laptop and Quest on the same private Wi-Fi network.

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
