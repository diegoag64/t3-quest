package dev.t3quest;

import android.app.*;
import android.content.*;
import android.content.pm.ServiceInfo;
import android.media.MediaRecorder;
import android.os.*;
import java.io.File;
import java.util.concurrent.*;
import org.json.JSONObject;

/** User-started dictation can continue while the game has focus. Never sends a T3 message. */
public final class VoiceService extends Service {
    static final String START="dev.t3quest.VOICE_START", STOP="dev.t3quest.VOICE_STOP", CANCEL="dev.t3quest.VOICE_CANCEL";
    public static volatile String activeThread;
    public static volatile long startedAt;
    private final Handler handler=new Handler(Looper.getMainLooper());
    private final ExecutorService network=Executors.newSingleThreadExecutor();
    private WavCapture capture;
    private String threadId;
    private File recording;
    private boolean processing,finished;
    private PowerManager.WakeLock wake;
    public static void start(Activity activity,String id) {
        if(activeThread!=null||LabState.running||LabState.recording)throw new IllegalStateException("Stop the current recording or test first.");
        activeThread=id;startedAt=SystemClock.elapsedRealtime();
        VoiceDrafts.update(activity,id,"recording","");
        try{activity.startForegroundService(new Intent(activity,VoiceService.class).setAction(START).putExtra("threadId",id));}
        catch(Exception e){activeThread=null;VoiceDrafts.update(activity,id,"draft","Could not start microphone. Keep the panel visible and retry.");throw e;}
    }
    public static void control(Context context,String id,boolean cancel){
        if(id.equals(activeThread))context.startService(new Intent(context,VoiceService.class).setAction(cancel?CANCEL:STOP));
    }
    @Override public void onCreate(){super.onCreate();NotificationChannel channel=new NotificationChannel("dictation","Voice drafts",NotificationManager.IMPORTANCE_LOW);channel.setSound(null,null);getSystemService(NotificationManager.class).createNotificationChannel(channel);}
    private Notification notification(String text){
        PendingIntent stop=PendingIntent.getService(this,21,new Intent(this,VoiceService.class).setAction(STOP),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        PendingIntent cancel=PendingIntent.getService(this,22,new Intent(this,VoiceService.class).setAction(CANCEL),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        PendingIntent open=PendingIntent.getActivity(this,23,new Intent(this,MainActivity.class).setAction(Intent.ACTION_MAIN).addCategory("com.oculus.intent.category.OVERLAY_LAUNCHER"),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        return new Notification.Builder(this,"dictation").setSmallIcon(R.drawable.ic_notification).setContentTitle("T3 voice draft").setContentText(text).setOngoing(true).setContentIntent(open).addAction(new Notification.Action.Builder(null,"Stop & transcribe",stop).build()).addAction(new Notification.Action.Builder(null,"Cancel",cancel).build()).build();
    }
    @Override public int onStartCommand(Intent intent,int flags,int startId){
        if(intent==null){stopSelf();return START_NOT_STICKY;}
        if(CANCEL.equals(intent.getAction())){finish("draft","");return START_NOT_STICKY;}
        if(STOP.equals(intent.getAction())){transcribe();return START_NOT_STICKY;}
        if(!START.equals(intent.getAction())||threadId!=null)return START_NOT_STICKY;
        threadId=intent.getStringExtra("threadId");
        try{
            startForeground(21,notification("Recording · stops after 60 seconds"),ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
            if(threadId==null||!threadId.equals(activeThread))throw new IllegalStateException("Recording target missing");
            wake=getSystemService(PowerManager.class).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"t3quest:dictation");wake.acquire(155000);
            recording=new File(getFilesDir(),"dictation-"+java.util.UUID.randomUUID()+".wav");
            capture=new WavCapture(this,recording.getName());capture.start(MediaRecorder.AudioSource.MIC);
            handler.postDelayed(this::transcribe,60000);
        }catch(Exception e){finish("draft","Microphone unavailable. Check permission and try again with the panel visible.");}
        return START_NOT_STICKY;
    }
    private void transcribe(){
        if(processing||finished||capture==null)return;
        processing=true;handler.removeCallbacksAndMessages(null);capture.stop();final double peak=capture.peakDb;capture=null;
        final String id=threadId;final File audio=recording;
        VoiceDrafts.update(this,id,"transcribing","");
        getSystemService(NotificationManager.class).notify(21,notification("Transcribing on your configured service…"));
        network.execute(()->{
            try{
                if(audio.length()<3200||peak<=-85)throw new IllegalStateException("No usable speech captured. Try again with the panel focused.");
                var settings=getSharedPreferences("settings",0);
                JSONObject result=BridgeClient.request(settings.getString("bridgeUrl",""),settings.getString("bridgeToken",""),"/api/transcribe",audio);
                String text=result.optString("text").trim();if(text.isEmpty())throw new IllegalStateException("No speech recognized. Try again.");
                handler.post(()->{if(!finished){String previous=VoiceDrafts.read(this,id).optString("text");VoiceDrafts.transcript(this,id,text);finish("draft",previous.length()+text.length()+1>12000?"Draft reached 12000 characters. Review the end before sending.":"");}});
            }catch(Exception e){handler.post(()->{if(!finished)finish("draft",e.getMessage());});}
            finally{audio.delete();}
        });
    }
    private void finish(String status,String error){
        if(finished)return;finished=true;handler.removeCallbacksAndMessages(null);
        if(capture!=null){capture.stop();capture=null;}
        if(threadId!=null)VoiceDrafts.update(this,threadId,status,error);
        activeThread=null;if(recording!=null)recording.delete();
        if(wake!=null&&wake.isHeld())wake.release();
        stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();
    }
    @Override public void onDestroy(){if(!finished)finish("draft","Dictation stopped. Your previous draft is saved.");network.shutdownNow();super.onDestroy();}
    @Override public IBinder onBind(Intent intent){return null;}
}
