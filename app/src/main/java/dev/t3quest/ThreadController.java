package dev.t3quest;

import android.app.*;
import android.content.*;
import android.net.Uri;
import android.os.*;
import org.json.*;
import java.util.concurrent.*;

/** Read-only conversation lifecycle inside the existing activity and WebView. */
public final class ThreadController {
    private final Activity activity;
    private final ThreadWebView web;
    private final ThreadComposer composer;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService network = Executors.newSingleThreadExecutor();
    private String threadId;
    private boolean resumed, loading;
    private int generation;

    public ThreadController(Activity activity, ThreadWebView web) {
        this.activity=activity; this.web=web; this.composer=new ThreadComposer(activity,web);
    }
    public boolean isOpen() { return threadId!=null; }
    public String selectedThread() { return threadId; }
    public void open(String id) {
        generation++; loading=false; handler.removeCallbacks(poll);
        threadId=id;
        web.showThread(id);composer.open(id);
        refresh();
    }
    public void close() {
        generation++; loading=false; threadId=null; handler.removeCallbacks(poll);
        web.showList();composer.close();
    }
    public void action(String action, JSONObject payload) {
        if(composer.action(action,payload))return;
        switch(action) {
            case "loadHistory":
                if (threadId!=null && threadId.equals(payload.optString("threadId"))) {
                    String cursor = payload.optString("cursor");
                    if (!cursor.isEmpty() && cursor.length() < 12000) fetch("history", "/api/threads/"+encoded(threadId)+"/history?cursor="+encoded(cursor));
                }
                break;
            case "loadItem":
                if (threadId!=null && threadId.equals(payload.optString("threadId"))) {
                    String item = payload.optString("itemId");
                    if (!item.isEmpty() && item.length()<2000) fetch("item", "/api/threads/"+encoded(threadId)+"/items/"+encoded(item));
                }
                break;
            case "openLink": openLink(payload.optString("url")); break;
            case "notice": new AlertDialog.Builder(activity).setMessage(payload.optString("text")).setPositiveButton("OK",null).show(); break;
        }
    }
    private static String encoded(String value) { return Uri.encode(value); }
    private void refresh() {
        if (!resumed || loading || threadId == null) return;
        loading=true;
        fetch("snapshot", "/api/threads/"+encoded(threadId));
    }
    private void fetch(String kind, String path) {
        final int epoch=generation; final String id=threadId;
        SharedPreferences settings=activity.getSharedPreferences("settings",Context.MODE_PRIVATE);
        String base=settings.getString("bridgeUrl",""), token=settings.getString("bridgeToken","");
        network.execute(() -> {
            try {
                JSONObject data=BridgeClient.request(base,token,path,null);
                handler.post(() -> {
                    if (activity.isDestroyed() || epoch!=generation) return;
                    web.send(kind,id,data);
                });
            } catch(Exception error) {
                handler.post(() -> {
                    if(activity.isDestroyed() || epoch!=generation)return;
                    JSONObject payload=new JSONObject();
                    try { payload.put("message", "Could not load " + (kind.equals("history")?"older messages":kind.equals("item")?"activity output":"live updates") + ". " + error.getMessage() + " · Keep the laptop bridge running."); } catch(Exception ignored) { }
                    web.send("error",id,payload);
                });
            } finally {
                if(kind.equals("snapshot"))handler.post(() -> {
                    if(epoch!=generation || activity.isDestroyed())return;
                    loading=false;handler.removeCallbacks(poll);if(resumed)handler.postDelayed(poll,2500);
                });
            }
        });
    }
    private final Runnable poll=this::refresh;
    private void openLink(String url) {
        Uri uri=Uri.parse(url);
        if (!("https".equals(uri.getScheme()) || "http".equals(uri.getScheme()))) return;
        new AlertDialog.Builder(activity).setTitle("Open link in browser?").setMessage(url).setNegativeButton("Cancel",null)
            .setPositiveButton("Open",(dialog,which)->{try{activity.startActivity(new Intent(Intent.ACTION_VIEW,uri));}catch(Exception ignored){}}).show();
    }
    public void resume(){resumed=true;composer.resume();refresh();}
    public void pause(){resumed=false;composer.pause();generation++;loading=false;handler.removeCallbacks(poll);}
    public void dispose(){pause();composer.dispose();handler.removeCallbacksAndMessages(null);network.shutdownNow();}
}
