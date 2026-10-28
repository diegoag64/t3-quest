package dev.t3quest;

import android.content.Context;
import org.json.JSONObject;
import java.util.UUID;

/** Private per-thread drafts survive closing the reader; message text never enters logs. */
public final class VoiceDrafts {
    private static boolean initialized;
    public static synchronized void initialize(Context context){
        if(initialized)return;initialized=true;
        if(VoiceService.activeThread==null){
            java.io.File[] recordings=context.getFilesDir().listFiles((dir,name)->name.startsWith("dictation-")&&name.endsWith(".wav"));
            if(recordings!=null)for(java.io.File file:recordings)file.delete();
        }
        for(String id:context.getSharedPreferences("drafts",0).getAll().keySet()){
            String status=read(context,id).optString("status");
            if(status.equals("sending"))update(context,id,"uncertain","Delivery was interrupted. Retry this same draft to check delivery without duplicating it.");
            if((status.equals("recording")||status.equals("transcribing"))&&VoiceService.activeThread==null)update(context,id,"draft","Dictation was interrupted. Your previous draft is saved.");
        }
    }
    public static synchronized JSONObject read(Context context, String id) {
        try { return new JSONObject(context.getSharedPreferences("drafts",0).getString(id,"{}")); }
        catch(Exception e){return new JSONObject();}
    }
    public static synchronized void put(Context context, String id, JSONObject draft) {
        context.getSharedPreferences("drafts",0).edit().putString(id,draft.toString()).commit();
    }
    public static synchronized void update(Context context,String id,String status,String error) {
        JSONObject d=read(context,id);
        try{d.put("status",status);d.put("error",error);}catch(Exception ignored){}
        put(context,id,d);
    }
    public static synchronized void text(Context context,String id,String text) {
        JSONObject d=read(context,id);
        try{d.put("text",text);d.put("requestId",UUID.randomUUID().toString());d.put("status","draft");d.put("error","");}catch(Exception ignored){}
        put(context,id,d);
    }
    public static synchronized void transcript(Context context,String id,String text) {
        JSONObject d=read(context,id);String previous=d.optString("text");
        text(context,id,(previous.isBlank()?text:previous+"\n"+text).substring(0,Math.min(12000,(previous.isBlank()?text:previous+"\n"+text).length())));
    }
}
