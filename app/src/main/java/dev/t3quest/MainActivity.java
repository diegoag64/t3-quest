package dev.t3quest;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.content.res.ColorStateList;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.media.*;
import android.os.*;
import android.text.InputType;
import android.text.TextUtils;
import android.view.*;
import android.widget.*;
import org.json.*;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.*;
import java.util.concurrent.*;

public class MainActivity extends androidx.activity.ComponentActivity {
    // T3 Code's shared default dark palette. See THIRD_PARTY_NOTICES.txt.
    private static final int BG = 0xff0a0a0a, SURFACE = 0xff111111, BORDER = 0xff191919;
    private static final int INK = 0xfff5f5f5, MUTED = 0xffa3a3a3, ACCENT = 0xff346bf1;
    private static final int BLUE = 0xff51a2ff, AMBER = 0xffffb900, RED = 0xffff6467;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService network = Executors.newSingleThreadExecutor();
    private final View[] pages = new View[3];
    private final Button[] tabs = new Button[3];
    private TextView status, meter, events, connection, transcript, connectionHelp, threadCount;
    private ThreadWebView threadWeb;
    private ThreadController threadController;
    private ReadingWindowHost readingHost;
    private FrameLayout content;
    private PrBrowserView inlineBrowser;
    private LinearLayout root, brand, nav;
    private EditText bridgeUrl, bridgeToken;
    private Switch record;
    private Spinner source, duration;
    private Button start, stop, replay, transcribe, checkConnection, disconnect;
    private MediaPlayer player;
    private boolean transcribing, checking, resumed, showAllThreads;
    private int connectionGeneration;
    private long lastPollAt;
    private String renderedThreads = "";

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        VoiceDrafts.initialize(this);
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        root = column(); root.setBackgroundColor(BG);
        root.setPadding(dp(12), dp(8), dp(12), dp(8));


        brand = row(); brand.setGravity(Gravity.CENTER_VERTICAL); root.addView(brand);
        TextView wordmark = text("T3 Code", 21, INK); wordmark.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        brand.addView(wordmark, new LinearLayout.LayoutParams(0, dp(38), 1));
        TextView badge = text("QUEST  /  LAB", 10, MUTED); badge.setTypeface(Typeface.MONOSPACE); brand.addView(badge);
        nav = row(); root.addView(nav);
        String[] labels = {"Threads", "Connect", "Test"};
        for (int i = 0; i < labels.length; i++) {
            final int page = i;
            tabs[i] = button(labels[i], nav, () -> selectPage(page));
        }
        connection = text("○  Laptop not connected", 12, MUTED); root.addView(connection);
        content = new FrameLayout(this); root.addView(content, new LinearLayout.LayoutParams(-1, 0, 1));
        for (int i = 0; i < pages.length; i++) {
            if (i == 0) {
                threadWeb = new ThreadWebView(this, "list", null, (action, payload) -> {
                    if (action.equals("openThread")) openThread(payload.optString("id"));
                    else if(action.equals("compact")) closeThread();
                    else threadController.action(action,payload);
                });
                threadController = new ThreadController(this,threadWeb,this::openPr);
                pages[i] = threadWeb; content.addView(threadWeb, new FrameLayout.LayoutParams(-1, -1));
                continue;
            }
            ScrollView scroll = new ScrollView(this); scroll.setFillViewport(true); scroll.setClipToPadding(false);
            LinearLayout body = column(); body.setPadding(0, dp(4), 0, dp(8)); scroll.addView(body);
            pages[i] = scroll; content.addView(scroll, new FrameLayout.LayoutParams(-1, -1));
            if (i == 1) buildConnection(body);
            if (i == 2) buildTest(body);
        }
        readingHost = new ReadingWindowHost(this, root, this::openInlineThread, this::openInlinePr, this::closeThread);
        selectPage(0);
        if(saved!=null && saved.getString("selectedThread")!=null)openThread(saved.getString("selectedThread"));
        LabState.event(this, "panel.created", "T3 panel opened");
    }

    private void openThread(String id) {
        if (id.isEmpty()) return;
        if (id.startsWith("demo-")) { toast("Connect to T3 Code to open a full conversation."); return; }
        if(id.length()>2000)return;
        selectPage(0);
        if (threadController.isOpen()) threadController.open(id);
        else readingHost.open(id);
        renderThreads();
        LabState.event(this,"thread.open","Requested centered reading window");
    }

    private void openInlineThread(String id) {
        setConversationChrome(true);
        threadController.open(id);
        toast("Reading in this panel — Quest could not open an extra window.");
    }
    private void openPr(String url) {
        if (GitHubPrUrl.root(url)==null) return;
        if (threadController.isOpen()) openInlinePr(url); else readingHost.openPr(url);
    }
    private void openInlinePr(String url) {
        closeInlinePr();
        setConversationChrome(true);threadController.pause();
        inlineBrowser=new PrBrowserView(this,this,url,threadController.isOpen()?"← Thread":"← Threads",this::closeInlinePr);
        content.addView(inlineBrowser,new FrameLayout.LayoutParams(-1,-1));
        if(!resumed)inlineBrowser.pause();
    }
    private void closeInlinePr() {
        if(inlineBrowser==null)return;
        content.removeView(inlineBrowser);inlineBrowser.dispose();inlineBrowser=null;
        setConversationChrome(threadController.isOpen());
        if(resumed)threadController.resume();
    }
    // Instrumentation uses this without changing the production navigation path.
    ReadingWindowHost readingWindowHost() { return readingHost; }

    private void setConversationChrome(boolean open) {
        int visibility=open?View.GONE:View.VISIBLE;
        brand.setVisibility(visibility);nav.setVisibility(visibility);connection.setVisibility(visibility);
        root.setPadding(open?0:dp(12),open?0:dp(8),open?0:dp(12),open?0:dp(8));
    }
    private void closeThread() {
        closeInlinePr();
        readingHost.close();
        if(threadController.isOpen())threadController.close();
        setConversationChrome(false);selectPage(0);renderThreads();
        LabState.event(this,"thread.close","Returned to list in the existing panel");
    }
    @Override public void onBackPressed(){if(inlineBrowser!=null){if(!inlineBrowser.goBack())closeInlinePr();return;}if(readingHost.backFromPr())return;if(readingHost.isOpen() || threadController.isOpen())closeThread();else super.onBackPressed();}
    @Override protected void onSaveInstanceState(Bundle saved){super.onSaveInstanceState(saved);saved.putString("selectedThread",readingHost.isOpen()?readingHost.selectedThread():threadController.selectedThread());}

    private void buildConnection(LinearLayout root) {
        heading(root, "Connect your laptop");
        LinearLayout voiceSetup = card(root, "Voice and sending");
        voiceSetup.addView(text("On your laptop, configure hosted transcription. The API key stays on the laptop.",13,INK));
        command(voiceSetup,"npm run setup:voice");
        voiceSetup.addView(text("Direct mode: create a T3 pairing link with permission to operate threads, then run:",13,INK));
        command(voiceSetup,"npm run pair -- --write");
        voiceSetup.addView(text("Restart the bridge. In a thread: tap Microphone, speak, Stop & transcribe, review the draft, then Send. Recording can continue with game focus and stops after 60 seconds.",13,MUTED));
        root.addView(text("Laptop + Quest on the same Wi-Fi. Keep T3 Code and the bridge running on your laptop.", 13, MUTED));
        LinearLayout first = card(root, "1  Pair the laptop bridge with T3");
        first.addView(text("In T3 Code: Settings → Sharing & access → create a direct pairing link. Use Network access if needed for your chosen address.", 13, INK));
        first.addView(text("In a terminal inside t3-quest:", 12, MUTED));
        command(first, "npm run pair");
        first.addView(text("Paste the fresh T3 link into that terminal. This grants read-only thread access.", 12, MUTED));
        LinearLayout second = card(root, "2  Send the connection to Quest");
        second.addView(text("Connect USB and accept USB debugging, then run:", 13, INK));
        command(second, "npm run connect:quest");
        second.addView(text("Choose your laptop’s Wi-Fi address. The command starts the bridge and transfers the address and token here. Keep that terminal open; USB can be unplugged after connecting over Wi-Fi.", 12, MUTED));
        LinearLayout third = card(root, "3  Check the connection");
        connectionHelp = text("Waiting for laptop setup. You can also enter the address and token below.", 13, INK); third.addView(connectionHelp);
        checkConnection = button("Check connection", third, () -> checkBridge(true)); primary(checkConnection);
        disconnect = button("Disconnect laptop", third, this::disconnect);
        LinearLayout manual = disclosure(root, "Manual connection");
        manual.addView(text("Without USB: run BRIDGE_HOST=0.0.0.0 npm start on the laptop. Enter the printed address and the token from .state/bridge-token. These are bridge details, not the T3 pairing link.", 12, MUTED));
        manual.addView(text("Laptop bridge address", 12, MUTED));
        bridgeUrl = input("http://192.168.1.20:8787", false); manual.addView(bridgeUrl);
        manual.addView(text("Bridge access token", 12, MUTED));
        bridgeToken = input("Paste bridge token", true); manual.addView(bridgeToken);
        button("Save & check", manual, () -> { if (saveConnection()) checkBridge(true); });
        loadConnectionFields();
        root.addView(text("Desktop mode: use the integration-enabled T3 app and npm run start:desktop to share all its connected environments, including T3 Connect. No per-machine pairing is needed. Direct mode above connects one server.", 12, MUTED));
    }

    private void buildTest(LinearLayout root) {
        heading(root, "Headset test");
        status = text("Alerts run during a headset test.", 12, MUTED); root.addView(status);
        root.addView(text("Open Beat Saber first, then this panel from the Meta menu. Enable Seamless Multitasking. Start the test and click back into the game.", 13, MUTED));
        LinearLayout controls = row(); root.addView(controls);
        start = button("Start 90s test", controls, this::requestStart); primary(start);
        stop = button("Stop", controls, () -> startService(new Intent(this, ProbeService.class).setAction(ProbeService.STOP)));
        record = new Switch(this); record.setText("Record microphone"); record.setChecked(true); record.setTextColor(INK); record.setTextSize(14); record.setMinHeight(dp(48)); root.addView(record);
        meter = text("Microphone not started", 12, MUTED); root.addView(meter);
        root.addView(text("15s · notification   25s · chime\n35s · speech if available   50s · say a phrase", 12, MUTED));
        LinearLayout options = disclosure(root, "Test options");
        options.addView(text("Microphone source", 12, MUTED));
        source = spinner(new String[]{"Standard microphone", "Voice communication"}); options.addView(source);
        options.addView(text("Duration", 12, MUTED));
        duration = spinner(new String[]{"90 seconds", "3 minutes"}); options.addView(duration);
        LinearLayout voice = card(root, "Voice recording");
        LinearLayout voiceControls = row(); voice.addView(voiceControls);
        replay = button("Replay", voiceControls, this::replay);
        transcribe = button("Transcribe", voiceControls, this::transcribe);
        transcript = text(LabState.transcript, 13, INK); transcript.setTextIsSelectable(true); voice.addView(transcript);
        voice.addView(text("Replay stays on Quest. Transcribe uploads the saved clip to your configured speech endpoint. Sending voice replies to T3 is not implemented yet.", 12, MUTED));
        LinearLayout results = disclosure(root, "Record test results");
        observation(results, "Panel stayed visible", "panel");
        observation(results, "Notification appeared", "notification");
        observation(results, "Chime was audible", "chime");
        observation(results, "Spoken cue was audible", "speech");
        observation(results, "Replay contains my voice during gameplay", "voice");
        observation(results, "Game controls and music were unaffected", "game");
        LinearLayout diagnostics = disclosure(root, "Diagnostics");
        events = text("No events yet", 11, MUTED); events.setTypeface(Typeface.MONOSPACE); events.setTextIsSelectable(true); diagnostics.addView(events);
    }

    private void selectPage(int selected) {
        for (int i = 0; i < pages.length; i++) {
            pages[i].setVisibility(i == selected ? View.VISIBLE : View.GONE);
            tabs[i].setTextColor(i == selected ? INK : MUTED);
            tabs[i].setBackground(background(i == selected ? 0xff1a1b1b : BG));
            tabs[i].setSelected(i == selected);
        }
        if (selected != 1) ((android.view.inputmethod.InputMethodManager)getSystemService(INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(bridgeUrl.getWindowToken(), 0);
    }

    private SharedPreferences settings() { return getSharedPreferences("settings", MODE_PRIVATE); }
    private void loadConnectionFields() { bridgeUrl.setText(settings().getString("bridgeUrl", "")); bridgeToken.setText(settings().getString("bridgeToken", "")); }

    private boolean saveConnection() {
        if (LabState.running) { toast("Stop the test before changing the connection."); return false; }
        try {
            String url = BridgeClient.normalizeUrl(bridgeUrl.getText().toString().trim());
            String token = bridgeToken.getText().toString().trim();
            if (token.isEmpty()) throw new IllegalArgumentException("Enter the bridge access token from your laptop.");
            settings().edit().putString("bridgeUrl", url).putString("bridgeToken", token).apply();
            resetConnection();
            return true;
        } catch (Exception error) { connectionHelp.setText(error.getMessage()); toast(error.getMessage()); return false; }
    }

    private void resetConnection() {
        connectionGeneration++; checking = false; lastPollAt = 0;
        LabState.threads = new JSONArray(); LabState.settledThreads = new JSONArray(); LabState.connection = "Connecting to laptop…";
        LabState.lastBridgeSuccess = 0; LabState.bridgeMode = ""; LabState.transcriptionConfigured = false;
    }

    private void disconnect() {
        if (LabState.running) { toast("Stop the test before disconnecting."); return; }
        settings().edit().remove("bridgeUrl").remove("bridgeToken").apply();
        resetConnection(); loadConnectionFields(); LabState.connection = "Laptop not connected";
        connectionHelp.setText("Disconnected. Your T3 session remains on the laptop.");
    }

    // The debug USB helper writes into this app's private files directory; no exported credential receiver.
    private void importConnection() {
        File file = new File(getFilesDir(), "bridge-config.json");
        if (!file.exists() || LabState.running) return;
        try {
            if (file.length() > 8192) throw new IllegalArgumentException("Configuration too large");
            JSONObject config = new JSONObject(new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8));
            String url = BridgeClient.normalizeUrl(config.getString("bridgeUrl"));
            String token = config.getString("bridgeToken");
            if (token.trim().isEmpty() || token.length() > 512) throw new IllegalArgumentException("Invalid bridge token");
            settings().edit().putString("bridgeUrl", url).putString("bridgeToken", token).apply();
            resetConnection(); loadConnectionFields();
            connectionHelp.setText("Connection received over USB. Checking your laptop…");
            LabState.event(this, "bridge.configured", "Connection imported from laptop over USB");
        } catch (Exception error) { toast("Could not import laptop connection. Run connect:quest again."); }
        finally { file.delete(); }
    }

    private void checkBridge(boolean explicit) {
        if (checking || LabState.running) return;
        final String url = settings().getString("bridgeUrl", ""), token = settings().getString("bridgeToken", "");
        if (url.isEmpty()) { if (explicit) connectionHelp.setText("Run npm run connect:quest on the laptop, or use Manual connection below."); return; }
        checking = true; lastPollAt = SystemClock.elapsedRealtime();
        final int generation = connectionGeneration;
        if (explicit) connectionHelp.setText("Checking laptop bridge and T3 connection…");
        network.execute(() -> {
            try {
                JSONObject result = BridgeClient.request(url, token, "/api/state", null);
                handler.post(() -> {
                    if (generation != connectionGeneration || isDestroyed()) return;
                    if (!LabState.running) LabState.acceptBridgeSnapshot(result);
                    updateConnectionHelp();
                });
            } catch (Exception error) {
                handler.post(() -> {
                    if (generation != connectionGeneration || isDestroyed()) return;
                    if (!LabState.running) LabState.connection = "Unavailable · " + friendlyError(error);
                    updateConnectionHelp();
                });
            } finally { handler.post(() -> { if (generation == connectionGeneration) checking = false; }); }
        });
    }

    private String friendlyError(Exception error) {
        if (error.getMessage() != null && error.getMessage().contains("401")) return "Token rejected. Run connect:quest again or check the bridge token.";
        if (error instanceof java.net.SocketTimeoutException) return "Laptop timed out. Check Wi-Fi, address, and firewall.";
        if (error instanceof java.net.ConnectException || error instanceof java.net.UnknownHostException) return "Cannot reach laptop. Keep the bridge terminal open and check Wi-Fi.";
        return "Bridge check failed. Check the address and restart the laptop bridge.";
    }

    private void updateConnectionHelp() {
        String value = LabState.connection;
        if (value.equals("t3-read-only · Connected") || value.equals("t3-connected · Connected")) connectionHelp.setText("Connected to T3 Code. Live threads are in Threads. Run a headset test for background alerts.");
        else if (value.equals("demo · Connected")) connectionHelp.setText("Laptop connected · demo only. Run npm run pair with a fresh T3 link, then restart connect:quest for real threads.");
        else if (value.startsWith("t3-read-only") || value.startsWith("t3-connected")) connectionHelp.setText("Laptop bridge reached; T3 is unavailable. Keep T3 running. If access expired, run npm run pair and restart the bridge.\n" + value);
        else connectionHelp.setText(value);
    }

    private void observation(LinearLayout parent, String label, String key) {
        parent.addView(text(label, 13, INK)); LinearLayout buttons = row(); parent.addView(buttons);
        for (String value : new String[]{"Yes", "No", "Not tested"}) button(value, buttons, () -> {
            getSharedPreferences("observations", MODE_PRIVATE).edit().putString(key, value).apply();
            LabState.event(this, "observation." + key, value); toast(label + ": " + value);
        });
    }

    private void requestStart() {
        if (LabState.running || transcribing || VoiceService.activeThread!=null) return;
        ArrayList<String> permissions = new ArrayList<>();
        if (record.isChecked() && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) permissions.add(Manifest.permission.RECORD_AUDIO);
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) permissions.add(Manifest.permission.POST_NOTIFICATIONS);
        if (!permissions.isEmpty()) requestPermissions(permissions.toArray(new String[0]), 10); else begin();
    }

    @Override public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(code, permissions, results);
        if (code != 10) return;
        if (record.isChecked() && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) { toast("Microphone permission denied. Turn recording off to test alerts."); return; }
        begin();
    }

    private void begin() {
        releasePlayer();
        Intent intent = new Intent(this, ProbeService.class).setAction(ProbeService.START)
                .putExtra("record", record.isChecked()).putExtra("duration", duration.getSelectedItemPosition() == 0 ? 90 : 180)
                .putExtra("source", source.getSelectedItemPosition() == 0 ? MediaRecorder.AudioSource.MIC : MediaRecorder.AudioSource.VOICE_COMMUNICATION);
        try { startForegroundService(intent); selectPage(0); }
        catch (Exception error) { LabState.event(this, "service.start.error", error.getMessage()); toast("Could not start test: " + error.getMessage()); }
    }

    private void replay() {
        if (LabState.recording) return;
        try {
            releasePlayer(); player = new MediaPlayer();
            player.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).build());
            player.setDataSource(new File(getFilesDir(), "probe.wav").getAbsolutePath());
            player.setOnCompletionListener(ignored -> releasePlayer()); player.prepare(); player.start();
            LabState.event(this, "voice.replay", "Playing saved test recording");
        } catch (Exception error) { releasePlayer(); toast("Cannot replay: " + error.getMessage()); }
    }

    private void transcribe() {
        if (LabState.running || transcribing || VoiceService.activeThread!=null) return;
        String url = settings().getString("bridgeUrl", ""), token = settings().getString("bridgeToken", "");
        if (url.isEmpty()) { selectPage(1); toast("Connect your laptop first."); return; }
        if (!LabState.transcriptionConfigured) { toast("Set TRANSCRIPTION_URL on the laptop bridge, then check the connection."); return; }
        new AlertDialog.Builder(this).setTitle("Transcribe the saved test?")
                .setMessage("Send the recording to your laptop bridge and its configured speech-to-text endpoint. Review the text here before using it elsewhere.")
                .setNegativeButton("Cancel", null).setPositiveButton("Transcribe", (dialog, which) -> {
                    transcribing = true; LabState.transcript = "Transcribing…";
                    network.execute(() -> {
                        try {
                            JSONObject result = BridgeClient.request(url, token, "/api/transcribe", new File(getFilesDir(), "probe.wav"));
                            LabState.transcript = result.optString("text", "No transcript returned");
                            LabState.event(this, "voice.transcribed", "Transcript received; not sent to T3");
                        } catch (Exception error) { LabState.transcript = "Transcription unavailable: " + error.getMessage(); }
                        finally { handler.post(() -> transcribing = false); }
                    });
                }).show();
    }

    private final Runnable refresh = new Runnable() {
        public void run() {
            if (!resumed) return;
            long elapsed = LabState.startedAt == 0 ? 0 : (SystemClock.elapsedRealtime() - LabState.startedAt) / 1000;
            status.setText(LabState.running ? "●  Test running · " + elapsed + "s · alerts enabled" : "Alerts run during a headset test.");
            status.setTextColor(LabState.running ? BLUE : MUTED);
            meter.setText(LabState.microphone + (LabState.recording ? String.format(Locale.US, "\n%.0f dBFS · %.0fs saved", LabState.rmsDb, LabState.audioBytes / 32000.0) : ""));
            String value = LabState.connection;
            boolean good = value.endsWith(" · Connected");
            boolean configured = !settings().getString("bridgeUrl", "").isEmpty();
            connection.setText(good ? "●  " + (LabState.bridgeMode.equals("demo") ? "Laptop connected · demo" : (LabState.canSend ? "T3 Code connected · sending enabled" : "T3 Code connected · read only")) : configured ? "○  " + value : "○  Laptop not connected · demo available");
            connection.setTextColor(good ? BLUE : MUTED);
            if (LabState.lastBridgeSuccess > 0 && !good) connection.append("\nShowing last received threads");
            if(VoiceService.activeThread!=null)connection.append(" · Voice draft in progress");
            transcript.setText(LabState.transcript); events.setText(LabState.recentEvents());
            start.setEnabled(!LabState.running && !transcribing); stop.setEnabled(LabState.running);
            start.setText(duration.getSelectedItemPosition() == 0 ? "Start 90s test" : "Start 3m test");
            record.setEnabled(!LabState.running); source.setEnabled(!LabState.running); duration.setEnabled(!LabState.running);
            checkConnection.setEnabled(!checking && !LabState.running); disconnect.setEnabled(configured && !LabState.running);
            boolean hasAudio = new File(getFilesDir(), "probe.wav").length() > 44;
            replay.setEnabled(hasAudio && !LabState.recording); transcribe.setEnabled(hasAudio && !LabState.running && !transcribing);
            for (Button control : new Button[]{start, stop, replay, transcribe, checkConnection, disconnect}) control.setAlpha(control.isEnabled() ? 1f : 0.4f);
            String next = LabState.threads.toString() + LabState.settledThreads.toString() + configured + LabState.connection + (SystemClock.elapsedRealtime()-LabState.lastBridgeSuccess<10000);
            if (!next.equals(renderedThreads)) { renderedThreads = next; renderThreads(); }
            if (configured && !LabState.running && SystemClock.elapsedRealtime() - lastPollAt >= 2500) checkBridge(false);
            handler.postDelayed(this, 750);
        }
    };

    private void renderThreads() {
        JSONObject data = new JSONObject();
        try {
            data.put("threads",LabState.threads); data.put("settledThreads",LabState.settledThreads);
            boolean connected=LabState.connection.endsWith(" · Connected")&&LabState.lastBridgeSuccess>0&&SystemClock.elapsedRealtime()-LabState.lastBridgeSuccess<10000;
            data.put("connected",connected);
            data.put("connectionLabel",connected?"Synced from your laptop":LabState.threads.length()>0?"Offline · showing last received threads":"Connect your laptop to load threads");
        } catch(Exception ignored) { }
        threadWeb.send("list",null,data);
        if(readingHost!=null)readingHost.sendList(data);
    }

    @Override protected void onNewIntent(Intent intent) { super.onNewIntent(intent); importConnection(); }
    @Override protected void onResume() { super.onResume(); resumed = true; importConnection(); if(inlineBrowser==null)threadController.resume();else inlineBrowser.resume(); readingHost.resume(); LabState.panelResumed = true; LabState.event(this, "panel.resumed", "Activity resumed"); handler.removeCallbacks(refresh); handler.post(refresh); }
    @Override protected void onPause() { resumed = false; if(inlineBrowser!=null)inlineBrowser.pause(); threadController.pause(); readingHost.pause(); LabState.panelResumed = false; LabState.event(this, "panel.paused", LabState.running ? "Panel paused; test continues" : "Panel paused; foreground polling paused"); handler.removeCallbacks(refresh); super.onPause(); }
    @Override public void onWindowFocusChanged(boolean focused) { super.onWindowFocusChanged(focused); LabState.panelFocused = focused; LabState.event(this, "panel.focus", Boolean.toString(focused)); }
    @Override protected void onDestroy() { if(inlineBrowser!=null)inlineBrowser.dispose(); connectionGeneration++; handler.removeCallbacksAndMessages(null); releasePlayer(); network.shutdownNow(); if(readingHost!=null)readingHost.dispose(); if(threadController!=null)threadController.dispose(); if(threadWeb!=null)threadWeb.dispose(); super.onDestroy(); }
    private void releasePlayer() { if (player != null) { player.release(); player = null; } }
    private void toast(String message) { Toast.makeText(this, message, Toast.LENGTH_LONG).show(); }
    private int dp(int n) { return Math.round(n * getResources().getDisplayMetrics().density); }
    private LinearLayout column() { LinearLayout view = new LinearLayout(this); view.setOrientation(LinearLayout.VERTICAL); return view; }
    private LinearLayout row() { LinearLayout view = new LinearLayout(this); view.setOrientation(LinearLayout.HORIZONTAL); return view; }
    private TextView text(String value, int size, int color) { TextView view = new TextView(this); view.setText(value); view.setTextSize(size); view.setTextColor(color); view.setPadding(0, dp(3), 0, dp(3)); return view; }
    private void heading(LinearLayout parent, String value) { TextView label = text(value, 18, INK); label.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL)); parent.addView(label); }
    private GradientDrawable background(int color) { GradientDrawable bg = new GradientDrawable(); bg.setColor(color); bg.setCornerRadius(dp(8)); bg.setStroke(dp(1), BORDER); return bg; }
    private void command(LinearLayout parent, String value) { TextView view = text(value, 13, INK); view.setTypeface(Typeface.MONOSPACE); view.setTextIsSelectable(true); view.setPadding(dp(10), dp(10), dp(10), dp(10)); view.setBackground(background(BG)); parent.addView(view); }
    private LinearLayout card(LinearLayout parent, String title) { LinearLayout card = column(); card.setPadding(dp(10), dp(10), dp(10), dp(10)); card.setBackground(background(SURFACE)); LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-1, -2); p.bottomMargin = dp(8); p.topMargin = dp(4); parent.addView(card, p); TextView label = text(title, 14, INK); label.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL)); card.addView(label); return card; }
    private LinearLayout disclosure(LinearLayout parent, String title) { LinearLayout body = column(); Button toggle = button("+  " + title, parent, () -> {}); body.setVisibility(View.GONE); body.setPadding(dp(4), dp(4), dp(4), dp(8)); parent.addView(body); toggle.setOnClickListener(v -> { boolean open = body.getVisibility() != View.VISIBLE; body.setVisibility(open ? View.VISIBLE : View.GONE); toggle.setText((open ? "−  " : "+  ") + title); }); return body; }
    private Button button(String label, LinearLayout parent, Runnable action) { Button view = new Button(this); view.setText(label); view.setTextSize(13); view.setTextColor(INK); view.setAllCaps(false); view.setMinWidth(0); view.setMinimumWidth(0); view.setMinHeight(dp(44)); view.setMinimumHeight(dp(44)); view.setPadding(dp(8), dp(6), dp(8), dp(6)); view.setBackground(new RippleDrawable(ColorStateList.valueOf(0x33ffffff), background(SURFACE), null)); view.setOnClickListener(v -> action.run()); LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(parent.getOrientation() == LinearLayout.HORIZONTAL ? 0 : -1, -2); if (parent.getOrientation() == LinearLayout.HORIZONTAL) { p.weight = 1; p.setMarginEnd(dp(4)); } p.topMargin = dp(3); p.bottomMargin = dp(3); parent.addView(view, p); return view; }
    private void primary(Button button) { button.setBackground(new RippleDrawable(ColorStateList.valueOf(0x33ffffff), background(ACCENT), null)); }
    private Spinner spinner(String[] choices) { Spinner view = new Spinner(this); view.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, choices)); view.setMinimumHeight(dp(48)); return view; }
    private EditText input(String hint, boolean secret) { EditText view = new EditText(this); view.setHint(hint); view.setTextSize(14); view.setTextColor(INK); view.setHintTextColor(MUTED); view.setSingleLine(true); view.setMinHeight(dp(48)); view.setInputType(InputType.TYPE_CLASS_TEXT | (secret ? InputType.TYPE_TEXT_VARIATION_PASSWORD : InputType.TYPE_TEXT_VARIATION_URI)); view.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO); return view; }
}
