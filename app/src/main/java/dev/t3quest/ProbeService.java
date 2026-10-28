package dev.t3quest;

import android.app.*;
import android.content.*;
import android.content.pm.ServiceInfo;
import android.media.*;
import android.os.*;
import android.speech.tts.TextToSpeech;
import org.json.*;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.*;

public class ProbeService extends Service {
    public static final String START = "dev.t3quest.START";
    public static final String STOP = "dev.t3quest.STOP";
    private static final String SESSION_CHANNEL = "session";
    private static final String ALERT_CHANNEL = "alerts";
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService network = Executors.newSingleThreadExecutor();
    private final Set<String> seenEvents = new HashSet<>();
    private WavCapture capture;
    private PowerManager.WakeLock wakeLock;
    private TextToSpeech speech;
    private ToneGenerator tone;
    private boolean speechReady;
    private boolean polling;
    private boolean stopping;
    private boolean receivedInitialState;
    private String bridgeUrl;
    private String bridgeToken;
    private String previousConnection = "";
    private int notificationId = 100;
    private int generation = 0;

    @Override public void onCreate() {
        super.onCreate();
        NotificationManager manager = getSystemService(NotificationManager.class);
        NotificationChannel session = new NotificationChannel(SESSION_CHANNEL, "Test session", NotificationManager.IMPORTANCE_LOW);
        session.setSound(null, null);
        manager.createNotificationChannel(session);
        NotificationChannel alerts = new NotificationChannel(ALERT_CHANNEL, "Thread and test alerts", NotificationManager.IMPORTANCE_HIGH);
        alerts.setDescription("Visual notification probe; sound is tested separately");
        alerts.setSound(null, null);
        alerts.enableVibration(false);
        manager.createNotificationChannel(alerts);
        try { tone = new ToneGenerator(AudioManager.STREAM_MUSIC, 35); }
        catch (Exception error) { LabState.event(this, "tone.unavailable", error.getClass().getSimpleName()); }
        speech = new TextToSpeech(this, status -> {
            speechReady = status == TextToSpeech.SUCCESS;
            if (speechReady) {
                int language = speech.setLanguage(Locale.US);
                speechReady = language >= TextToSpeech.LANG_AVAILABLE;
                speech.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build());
            }
            LabState.event(this, "speech.engine", speechReady ? "Available" : "No usable English TTS engine; the chime test still works");
        });
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || STOP.equals(intent.getAction())) { stopSession(); return START_NOT_STICKY; }
        if (!START.equals(intent.getAction()) || LabState.running) return START_NOT_STICKY;
        boolean record = intent.getBooleanExtra("record", true);
        int duration = Math.max(45, Math.min(180, intent.getIntExtra("duration", 90)));
        SharedPreferences settings = getSharedPreferences("settings", MODE_PRIVATE);
        bridgeUrl = settings.getString("bridgeUrl", "").trim();
        bridgeToken = settings.getString("bridgeToken", "").trim();
        stopping = false;
        LabState.startedAt = SystemClock.elapsedRealtime();
        try {
            int types = ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK;
            if (record && Build.VERSION.SDK_INT >= 30) types |= ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE;
            startForeground(1, notification(SESSION_CHANNEL, "Quest test running", "Stops automatically in " + duration + " seconds", true), types);
            LabState.running = true;
            wakeLock = getSystemService(PowerManager.class).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "t3quest:probe");
            wakeLock.acquire((duration + 10L) * 1000);
            LabState.event(this, "session.start", "Duration=" + duration + "s; record=" + record + "; source=" + intent.getIntExtra("source", MediaRecorder.AudioSource.MIC));
            LabState.device(this);
            if (record) {
                java.io.File previous = new java.io.File(getFilesDir(), "probe.wav");
                if (previous.exists() && !previous.delete()) throw new IllegalStateException("Could not replace the previous recording");
                capture = new WavCapture(this);
                try { capture.start(intent.getIntExtra("source", MediaRecorder.AudioSource.MIC)); }
                catch (Exception error) {
                    LabState.microphone = "Microphone failed · " + error.getMessage();
                    LabState.event(this, "mic.error", LabState.microphone);
                }
            } else { LabState.microphone = "Recording disabled for this session"; }
            if (bridgeUrl.isEmpty()) {
                LabState.connection = "Standalone demo";
                demoThreads(false);
            } else {
                LabState.connection = "Connecting to bridge…";
                poll();
            }
            handler.postDelayed(() -> postAlert("Notification test", "15 seconds elapsed. Did a banner appear over Beat Saber?"), 15_000);
            handler.postDelayed(() -> { chime(); if (bridgeUrl.isEmpty()) demoThreads(true); }, 25_000);
            handler.postDelayed(() -> speak("T3 Quest speech test. If you can hear this during the song, spoken alerts are reaching you."), 35_000);
            handler.postDelayed(this::stopSession, duration * 1000L);
            handler.postDelayed(heartbeat, 5000);
        } catch (Exception error) {
            LabState.event(this, "session.error", error.getClass().getSimpleName() + ": " + error.getMessage());
            stopSession();
        }
        return START_NOT_STICKY;
    }

    private void demoThreads(boolean finished) {
        try {
            JSONArray threads = new JSONArray();
            threads.put(new JSONObject().put("id", "demo-auth").put("title", "Authentication tests")
                    .put("status", finished ? "completed" : "running").put("project", "Demo project")
                    .put("summary", finished ? "Simulated completion. No coding agent ran." : "Simulated task for the headset test."));
            threads.put(new JSONObject().put("id", "demo-ui").put("title", "Settings panel")
                    .put("status", "needs-you").put("project", "Demo project").put("summary", "Example question: which accent color?"));
            LabState.threads = threads;
        } catch (JSONException ignored) {}
    }

    private final Runnable heartbeat = new Runnable() {
        public void run() {
            if (!LabState.running) return;
            LabState.event(ProbeService.this, "session.heartbeat", "Service alive");
            handler.postDelayed(this, 5000);
        }
    };

    private void poll() {
        if (!LabState.running || polling || stopping) return;
        polling = true;
        final int epoch = generation;
        network.execute(() -> {
            try {
                JSONObject result = BridgeClient.request(bridgeUrl, bridgeToken, "/api/state", null);
                handler.post(() -> {
                    if (epoch != generation || !LabState.running) return;
                    LabState.acceptBridgeSnapshot(result);
                    updateConnection(LabState.connection);
                    JSONArray events = result.optJSONArray("events");
                    if (events != null) {
                        for (int i = 0; i < events.length(); i++) {
                            JSONObject event = events.optJSONObject(i);
                            if (event == null) continue;
                            String id = event.optString("id");
                            if (id.isEmpty() || !seenEvents.add(id) || !receivedInitialState) continue;
                            String title = event.optString("title", "Thread update");
                            postAlert(title, event.optString("message", "Thread changed"));
                            chime();
                        }
                    }
                    receivedInitialState = true;
                });
            } catch (Exception error) {
                handler.post(() -> {
                    if (epoch == generation && LabState.running) updateConnection("Unavailable · " + error.getMessage());
                });
            } finally {
                handler.post(() -> {
                    if (epoch != generation) return;
                    polling = false;
                    if (LabState.running) handler.postDelayed(this::poll, 2000);
                });
            }
        });
    }

    private void updateConnection(String status) {
        LabState.connection = status;
        if (!status.equals(previousConnection)) {
            previousConnection = status;
            LabState.event(this, "bridge.status", status);
        }
    }

    private Notification notification(String channel, String title, String message, boolean ongoing) {
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification.Builder builder = new Notification.Builder(this, channel)
                .setSmallIcon(R.drawable.ic_notification).setContentTitle(title).setContentText(message)
                .setStyle(new Notification.BigTextStyle().bigText(message)).setContentIntent(open)
                .setCategory(ongoing ? Notification.CATEGORY_SERVICE : Notification.CATEGORY_STATUS)
                .setAutoCancel(!ongoing).setOngoing(ongoing);
        if (ongoing) {
            PendingIntent stop = PendingIntent.getService(this, 1, new Intent(this, ProbeService.class).setAction(STOP), PendingIntent.FLAG_IMMUTABLE);
            builder.addAction(new Notification.Action.Builder(null, "Stop test", stop).build());
        }
        return builder.build();
    }

    private void postAlert(String title, String message) {
        NotificationManager manager = getSystemService(NotificationManager.class);
        try {
            boolean enabled = manager.areNotificationsEnabled();
            manager.notify(notificationId++, notification(ALERT_CHANNEL, title, message, false));
            LabState.event(this, "notification.posted", "enabled=" + enabled + "; visual delivery needs your observation");
        } catch (Exception error) { LabState.event(this, "notification.error", error.getClass().getSimpleName()); }
    }

    private void chime() {
        try {
            boolean played = tone != null && tone.startTone(ToneGenerator.TONE_PROP_ACK, 450);
            LabState.event(this, "tone.requested", "accepted=" + played + "; no audio focus requested");
        } catch (Exception error) { LabState.event(this, "tone.error", error.getClass().getSimpleName()); }
    }

    private void speak(String text) {
        if (!speechReady) { LabState.event(this, "speech.skipped", "No TTS engine available"); return; }
        int result = speech.speak(text, TextToSpeech.QUEUE_FLUSH, null, "t3-quest-test");
        LabState.event(this, "speech.requested", "Engine result=" + result + "; audibility needs your observation");
    }

    private void stopSession() {
        if (stopping) return;
        stopping = true;
        generation++;
        handler.removeCallbacksAndMessages(null);
        if (capture != null) { capture.stop(); capture = null; }
        LabState.running = false;
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        LabState.event(this, "session.stop", "Test ended; microphone released");
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    @Override public void onDestroy() {
        stopSession();
        network.shutdownNow();
        if (speech != null) speech.shutdown();
        if (tone != null) tone.release();
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}
