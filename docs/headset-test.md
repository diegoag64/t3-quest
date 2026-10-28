# Test while Beat Saber runs

Install the APK using [the setup guide](setup.md). The standalone microphone and notification probes do not require a bridge.

## Dictate a thread message

Configure a hosted provider and pair with thread-operate permission using [voice setup](../README.md#voice-drafts-and-sending). Keep the laptop bridge running.

1. Open a thread over Beat Saber and tap the microphone. Grant permission if requested, then tap again.
2. Return focus to the game and speak a short, distinctive message intended for that thread.
3. Tap **Stop & transcribe**, or let the 60-second recording limit stop it.
4. Verify that your words appear in the draft and that nothing was sent yet. Check recognition accuracy with the game's audio playing.
5. Close and reopen the reader. Confirm that the draft is preserved in the same thread.
6. Review or edit the draft, then tap **Send**. Confirm that it appears once in the laptop's T3 thread. Active work receives the message in its queue.

If the service cannot capture speech while the game has focus, repeat with the panel focused. Record both outcomes. Provider setup and a successful API request alone do not establish that gameplay capture works.

## Establish a baseline

1. Open **T3 Quest Lab** in the Quest home environment.
2. Open **Test** and leave microphone recording enabled. The default duration is 90 seconds.
3. Tap **Start 90s test** and grant the requested permissions.
4. Speak a distinctive phrase, such as "Quest test, green triangles, seven." Watch the microphone level change.
5. Observe the scheduled probes:

   | Time | Probe | Observation |
   | --- | --- | --- |
   | 15 seconds | Android notification without sound | Does Quest show a banner? |
   | 25 seconds | Chime without an audio-focus request | Can you hear it? |
   | 35 seconds | Spoken cue through Android text-to-speech | Is a speech engine available and audible? |
   | 90 seconds | Automatic stop | Does capture stop and the replay button become available? |

6. Tap **Test → Replay** after the session stops.
7. Open **Test → Record test results** and record your observations with the **Yes**, **No**, and **Not tested** buttons.

The app records your selections in the event log. Missing text-to-speech is an independent result. It does not prevent microphone recording or chimes.

## Keep the panel beside Beat Saber

1. Enable Quest's multitasking option if your OS exposes a toggle for it. Meta has used both Experimental and Advanced settings for this option.
2. Open Beat Saber first.
3. Press the Meta button and open **T3 Quest Lab** from the app library while Beat Saber remains open. A panel opened in the home environment can disappear when the game launches.
4. Start a new test in the panel, then point at the game outside the panel and click to return controller focus. Start a song.
5. Observe the probes at 15, 25, and 35 seconds.
6. Speak the test phrase around 50 seconds while the game has focus.
7. After the test ends, replay the recording and enter your observations.
8. Check whether pointing or swinging near the panel interfered with game input.

The panel is managed by Horizon OS. This prototype cannot force its position, keep a custom HUD attached to your view, or bypass the game's focus behavior.

If the panel disappears, bring up the system menu while Beat Saber is open and select **T3 Quest Lab** again. Search the headset settings for **Seamless Multitasking** if returning focus to the game hides the panel. The option's location depends on the OS version.

With USB connected, reopen the app using its overlay launcher entry:

```sh
bash scripts/quest.sh launch
```

See [Meta's description of overlay launch](https://developers.meta.com/vr/documentation/spatial-sdk/hybrid-apps-overview/) and [the multitasking guide by Meta Quest PM Ron Forbes](https://www.ronforbes.com/blog/unlocking-seamless-multitasking-on-meta-quest).

## Test with the panel hidden

1. Start another test.
2. Hide the panel and return to Beat Saber.
3. Repeat the spoken phrase and alert observations.
4. Return after 90 seconds and replay the recording.

If microphone capture fails, repeat with **Test → Test options → Voice communication** selected. Keep the same game state and test phrase. The app logs the source used for each session.

## Read the evidence

Connect USB after playing, then run:

```sh
bash scripts/quest.sh collect
npm run report
```

The report describes the latest session. It counts microphone samples taken without panel focus, samples with measurable audio energy, OS silence indications, and alert requests. It also includes your manual observations.

Audio energy can come from Beat Saber's music. Replay is necessary to establish that your voice was captured. `notification.posted` means the Android API accepted the call, not that Quest showed it. Chime and speech requests likewise need listening confirmation.

Each recording replaces the previous `probe.wav`. Collect the files after each comparison if you want to keep both recordings. The JSONL log retains multiple sessions until rotation at roughly 2 MB.
