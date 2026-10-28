package dev.t3quest;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.*;
import org.json.JSONObject;
import java.util.UUID;
import java.util.concurrent.*;

/** Routes composer actions to a captured thread ID; only Send dispatches a message. */
public final class ThreadComposer {
    private static final ExecutorService SENDS=Executors.newSingleThreadExecutor();
    private final Activity activity;
    private final ThreadWebView web;
    private final Handler handler=new Handler(Looper.getMainLooper());
    private String id,last="";
    private boolean resumed;
    ThreadComposer(Activity activity,ThreadWebView web){this.activity=activity;this.web=web;}
    void open(String value){id=value;last="";publish();if(resumed){handler.removeCallbacks(tick);handler.post(tick);}}
    void close(){id=null;handler.removeCallbacks(tick);}
    void resume(){resumed=true;handler.removeCallbacks(tick);handler.post(tick);}
    void pause(){resumed=false;handler.removeCallbacks(tick);}
    void dispose(){pause();id=null;}
    private final Runnable tick=()->{publish();if(resumed)handler.postDelayed(this.tick,350);};
    private void publish(){
        if(id==null||activity.isDestroyed())return;
        JSONObject d=VoiceDrafts.read(activity,id);String status=d.optString("status","draft");
        if((status.equals("recording")||status.equals("transcribing"))&&!id.equals(VoiceService.activeThread)){
            VoiceDrafts.update(activity,id,"draft","Dictation was interrupted. Your draft is saved.");d=VoiceDrafts.read(activity,id);
        }
        try{
            d.put("canSend",LabState.canSend);d.put("canRecord",LabState.transcriptionConfigured);
            d.put("otherRecording",VoiceService.activeThread!=null&&!id.equals(VoiceService.activeThread));
            d.put("seconds",id.equals(VoiceService.activeThread)?Math.min(60,(SystemClock.elapsedRealtime()-VoiceService.startedAt)/1000):0);
        }catch(Exception ignored){}
        if(!last.equals(d.toString())){last=d.toString();web.send("composer",id,d);}
    }
    boolean action(String action,JSONObject payload){
        if(!java.util.Set.of("draftChanged","dictateStart","dictateStop","dictateCancel","sendMessage","discardDraft").contains(action))return false;
        if(id==null||!id.equals(payload.optString("threadId")))return true;
        final String target=id;
        JSONObject d=VoiceDrafts.read(activity,target);String status=d.optString("status","draft");
        boolean busy=status.equals("recording")||status.equals("transcribing")||status.equals("sending");
        switch(action){
            case "draftChanged":
                String text=payload.optString("text");
                if(!busy&&!status.equals("uncertain")&&text.length()<=12000)VoiceDrafts.text(activity,target,text);
                break;
            case "dictateStart":
                if(busy||status.equals("uncertain"))break;
                if(!LabState.transcriptionConfigured){VoiceDrafts.update(activity,target,"draft","Configure hosted transcription on the laptop: npm run setup:voice.");break;}
                if(activity.checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED){
                    activity.requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO},20);
                    VoiceDrafts.update(activity,target,"draft","Allow microphone access, then tap the microphone again.");break;
                }
                try{VoiceService.start(activity,target);}catch(Exception e){VoiceDrafts.update(activity,target,"draft",e.getMessage());}
                break;
            case "dictateStop": VoiceService.control(activity,target,false);break;
            case "dictateCancel": VoiceService.control(activity,target,true);break;
            case "discardDraft":
                if(busy)break;
                if(status.equals("uncertain"))new AlertDialog.Builder(activity).setTitle("Discard this draft?").setMessage("Delivery was not confirmed. The message may already be in T3. Check the thread before sending it again.").setNegativeButton("Keep",null).setPositiveButton("Discard",(dialog,which)->VoiceDrafts.text(activity,target,"")).show();
                else VoiceDrafts.text(activity,target,"");
                break;
            case "sendMessage":
                if(busy||!LabState.canSend)break;
                String message=payload.optString("text");
                if(message.isBlank()||message.length()>12000)break;
                if(status.equals("uncertain")&&!message.equals(d.optString("text")))break;
                if(!message.equals(d.optString("text")))VoiceDrafts.text(activity,target,message);
                send(target);
                break;
        }
        last="";publish();return true;
    }
    private void send(String target){
        Context context=activity.getApplicationContext();JSONObject d=VoiceDrafts.read(context,target);
        final JSONObject body=new JSONObject();
        try{
            if(d.optString("requestId").isEmpty())d.put("requestId",UUID.randomUUID().toString());
            body.put("text",d.optString("text"));body.put("requestId",d.getString("requestId"));
            d.put("status","sending");d.put("error","");VoiceDrafts.put(context,target,d);
        }catch(Exception e){return;}
        var settings=context.getSharedPreferences("settings",0);
        final String base=settings.getString("bridgeUrl",""),token=settings.getString("bridgeToken","");
        SENDS.execute(()->{
            try{
                JSONObject result=BridgeClient.post(base,token,"/api/threads/"+Uri.encode(target)+"/messages",body);
                if(!result.optBoolean("ok")||!body.optString("requestId").equals(result.optString("requestId")))throw new IllegalStateException("Delivery not confirmed. Retry this same draft.");
                VoiceDrafts.text(context,target,"");VoiceDrafts.update(context,target,"sent","");
            }catch(Exception e){VoiceDrafts.update(context,target,"uncertain",e.getMessage());}
        });
    }
}
