package dev.t3quest;

import android.content.Context;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.AudioRecordingConfiguration;
import android.media.MediaRecorder;
import android.os.Build;
import org.json.JSONObject;
import java.io.File;
import java.io.RandomAccessFile;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;

/** Capture in a foreground service; no SpeechRecognizer or Google Play dependency. */
public final class WavCapture {
    private static final int RATE = 16000;
    private volatile boolean capturing;
    private AudioRecord recorder;
    private Thread worker;
    private final Context context;

    public WavCapture(Context context) { this.context = context; }

    public void start(int source) throws Exception {
        if (context.checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            throw new SecurityException("Microphone permission is not granted");
        }
        if (worker != null && worker.isAlive()) throw new IllegalStateException("Previous capture is still closing");
        int minimum = AudioRecord.getMinBufferSize(RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
        if (minimum <= 0) throw new IllegalStateException("16 kHz microphone format unavailable");
        recorder = new AudioRecord(source, RATE, AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT, Math.max(minimum * 2, 8192));
        if (recorder.getState() != AudioRecord.STATE_INITIALIZED) {
            recorder.release(); recorder = null;
            throw new IllegalStateException("Microphone could not initialize");
        }
        try { recorder.startRecording(); }
        catch (Exception error) { recorder.release(); recorder = null; throw error; }
        capturing = true;
        LabState.recording = true;
        LabState.audioBytes = 0;
        LabState.microphone = "Capturing · " + (source == MediaRecorder.AudioSource.VOICE_COMMUNICATION ? "voice communication" : "microphone");
        worker = new Thread(this::capture, "t3-quest-microphone");
        worker.start();
        LabState.event(context, "mic.start", LabState.microphone);
    }

    private void capture() {
        File output = new File(context.getFilesDir(), "probe.wav");
        short[] samples = new short[1600];
        ByteBuffer bytes = ByteBuffer.allocate(samples.length * 2).order(ByteOrder.LITTLE_ENDIAN);
        long lastMeter = 0;
        long total = 0;
        try (RandomAccessFile file = new RandomAccessFile(output, "rw")) {
            file.setLength(0);
            file.write(header(0));
            try {
                while (capturing) {
                    int count = recorder.read(samples, 0, samples.length);
                    if (count < 0) {
                        if (capturing) throw new IllegalStateException("AudioRecord read failed: " + count);
                        break;
                    }
                    if (count == 0) continue;
                    double squares = 0;
                    bytes.clear();
                    for (int i = 0; i < count; i++) {
                        squares += (double) samples[i] * samples[i];
                        bytes.putShort(samples[i]);
                    }
                    file.write(bytes.array(), 0, count * 2);
                    total += count * 2L;
                    LabState.audioBytes = total;
                    LabState.rmsDb = Math.max(-96, 20 * Math.log10(Math.max(1, Math.sqrt(squares / count)) / 32768));
                    long now = android.os.SystemClock.elapsedRealtime();
                    if (now - lastMeter >= 1000) {
                        lastMeter = now;
                        AudioRecordingConfiguration configuration = recorder.getActiveRecordingConfiguration();
                        String silenced = configuration == null ? "unknown" : Boolean.toString(configuration.isClientSilenced());
                        LabState.event(context, "mic.sample", String.format(java.util.Locale.US, "%.1f dBFS; OS silenced=%s", LabState.rmsDb, silenced));
                    }
                }
            } finally {
                file.seek(0);
                file.write(header(total));
            }
        } catch (Exception error) {
            LabState.event(context, "mic.error", error.getClass().getSimpleName() + ": " + error.getMessage());
        } finally {
            capturing = false;
            LabState.recording = false;
            LabState.microphone = total > 0 ? "Recording saved · " + (total / (RATE * 2)) + " seconds" : "No audio captured";
            try { recorder.stop(); } catch (Exception ignored) {}
            recorder.release();
            LabState.event(context, "mic.saved", LabState.microphone);
        }
    }

    public void stop() {
        capturing = false;
        if (recorder != null && LabState.recording) {
            try { recorder.stop(); } catch (Exception ignored) {}
        }
        if (worker != null) {
            try { worker.join(2000); }
            catch (InterruptedException error) { Thread.currentThread().interrupt(); }
        }
    }

    public static byte[] header(long length) {
        ByteBuffer buffer = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN);
        buffer.put(new byte[]{'R','I','F','F'}).putInt((int) length + 36);
        buffer.put(new byte[]{'W','A','V','E','f','m','t',' '}).putInt(16);
        buffer.putShort((short) 1).putShort((short) 1).putInt(RATE).putInt(RATE * 2);
        buffer.putShort((short) 2).putShort((short) 16);
        buffer.put(new byte[]{'d','a','t','a'}).putInt((int) length);
        return buffer.array();
    }
}
