package dev.t3quest;

import android.content.Context;
import android.os.Build;
import android.os.SystemClock;
import android.util.Log;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.FileWriter;
import java.time.Instant;
import java.util.ArrayDeque;

/** Process state is ephemeral; event evidence survives activity and service lifecycles. */
public final class LabState {
    public static volatile boolean running = false;
    public static volatile boolean recording = false;
    public static volatile boolean panelFocused = false;
    public static volatile boolean panelResumed = false;
    public static volatile long startedAt = 0;
    public static volatile double rmsDb = -96;
    public static volatile long audioBytes = 0;
    public static volatile String microphone = "Not started";
    public static volatile String connection = "Standalone demo";
    public static volatile String bridgeMode = "";
    public static volatile long lastBridgeSuccess = 0;
    public static volatile boolean transcriptionConfigured = false;
    public static volatile String transcript = "Record a test, then replay it here. Optional transcription uses your computer bridge.";
    public static volatile JSONArray threads = new JSONArray();
    public static volatile JSONArray settledThreads = new JSONArray();
    private static final ArrayDeque<String> recent = new ArrayDeque<>();

    private LabState() {}

    public static void acceptBridgeSnapshot(JSONObject result) {
        threads = result.optJSONArray("threads") == null ? new JSONArray() : result.optJSONArray("threads");
        settledThreads = result.optJSONArray("settledThreads") == null ? new JSONArray() : result.optJSONArray("settledThreads");
        bridgeMode = result.optString("mode");
        connection = bridgeMode + " · " + result.optString("status");
        transcriptionConfigured = result.optBoolean("transcriptionConfigured");
        lastBridgeSuccess = SystemClock.elapsedRealtime();
    }

    public static synchronized void event(Context context, String type, String message) {
        try {
            JSONObject event = new JSONObject();
            event.put("time", Instant.now().toString());
            event.put("elapsedMs", startedAt == 0 ? 0 : SystemClock.elapsedRealtime() - startedAt);
            event.put("type", type);
            event.put("message", message);
            event.put("panelFocused", panelFocused);
            event.put("panelResumed", panelResumed);
            event.put("recording", recording);
            event.put("rmsDb", rmsDb);
            event.put("audioBytes", audioBytes);
            File file = new File(context.getFilesDir(), "events.jsonl");
            if (file.length() > 2_000_000) {
                File previous = new File(context.getFilesDir(), "events-previous.jsonl");
                if (previous.exists()) previous.delete();
                file.renameTo(previous);
            }
            try (FileWriter writer = new FileWriter(file, true)) {
                writer.write(event + "\n");
            }
            recent.addFirst(type + " · " + message);
            while (recent.size() > 14) recent.removeLast();
            Log.i("T3Quest", type + ": " + message);
        } catch (Exception error) {
            Log.e("T3Quest", "Could not save diagnostic event", error);
        }
    }

    public static synchronized String recentEvents() { return String.join("\n", recent); }

    public static void device(Context context) {
        event(context, "device", Build.MANUFACTURER + " " + Build.MODEL + "; Android API " + Build.VERSION.SDK_INT + "; " + Build.DISPLAY);
    }
}
