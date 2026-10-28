package dev.t3quest;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.graphics.Color;
import android.net.Uri;
import android.util.Base64;
import android.webkit.*;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

/** A packaged, offline UI. Network access and credentials remain in native code. */
public final class ThreadWebView extends WebView {
    public interface Actions { void onAction(String action, JSONObject payload); }
    private final Activity activity;
    private final Actions actions;
    private String mode;
    private String threadId;
    private boolean ready;
    private JSONObject pendingList;
    private final Map<String, JSONObject> pending = new HashMap<>();
    private static final String ORIGIN = "https://quest.t3.local";

    @SuppressLint({"SetJavaScriptEnabled", "JavascriptInterface"})
    public ThreadWebView(Activity activity, String mode, String threadId, Actions actions) {
        this(activity, activity, mode, threadId, actions);
    }
    @SuppressLint({"SetJavaScriptEnabled", "JavascriptInterface"})
    public ThreadWebView(Context context, Activity activity, String mode, String threadId, Actions actions) {
        super(context); this.activity = activity; this.mode = mode; this.threadId = threadId; this.actions = actions;
        setBackgroundColor(Color.BLACK);
        getSettings().setJavaScriptEnabled(true);
        getSettings().setAllowFileAccess(false); getSettings().setAllowContentAccess(false);
        getSettings().setDomStorageEnabled(false); getSettings().setDatabaseEnabled(false);
        getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        getSettings().setMediaPlaybackRequiresUserGesture(true);
        getSettings().setTextZoom(100); getSettings().setSupportMultipleWindows(false);
        CookieManager.getInstance().setAcceptThirdPartyCookies(this, false);
        addJavascriptInterface(new Object() {
            @JavascriptInterface public void request(String action, String json) {
                if (json == null || json.length() > 80000) return;
                try {
                    JSONObject payload = new JSONObject(json);
                    activity.runOnUiThread(() -> { if (!activity.isDestroyed()) actions.onAction(action, payload); });
                } catch (Exception ignored) { }
            }
        }, "T3Quest");
        setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return true; }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (!"https".equals(uri.getScheme()) || !"quest.t3.local".equals(uri.getHost())) return blocked();
                String path = uri.getPath();
                if (path == null || !path.matches("/ui/[A-Za-z0-9_./-]+") || path.contains("..")) return blocked();
                String mime = path.endsWith(".js") ? "application/javascript" : path.endsWith(".css") ? "text/css" : path.endsWith(".svg") ? "image/svg+xml" : path.endsWith(".html") ? "text/html" : "text/plain";
                try { return new WebResourceResponse(mime, "UTF-8", activity.getAssets().open(path.substring(1))); }
                catch (Exception error) { return blocked(); }
            }
            @Override public void onPageFinished(WebView view, String url) {
                if (!url.equals(ORIGIN + "/ui/index.html")) return;
                ready = true;
                JSONObject config = new JSONObject();
                try { config.put("mode", mode); config.put("threadId", ThreadWebView.this.threadId); } catch (Exception ignored) { }
                evaluateJavascript("QuestView.configure(" + config + ")", null);
                if (pendingList != null) send(pendingList);
                for (JSONObject event : pending.values()) send(event);
                pending.clear();
            }
        });
        loadUrl(ORIGIN + "/ui/index.html");
    }
    private static WebResourceResponse blocked() { return new WebResourceResponse("text/plain", "UTF-8", 403, "Blocked", new HashMap<>(), new ByteArrayInputStream(new byte[0])); }
    public void showThread(String id) {
        boolean alreadyOpen="thread".equals(mode);
        mode="thread";threadId=id;pending.clear();
        if(ready)evaluateJavascript(alreadyOpen ? "QuestView.selectThread("+JSONObject.quote(id)+")" : "QuestView.configure({mode:'thread',threadId:"+JSONObject.quote(id)+"})",null);
    }
    public void showList() {
        mode="list";threadId=null;pending.clear();
        if(ready)evaluateJavascript("QuestView.configure({mode:'list'})",null);
    }
    public void send(JSONObject event) {
        if (!ready) { if (event.optString("kind").equals("list")) pendingList = event; else pending.put(event.optString("kind"), event); return; }
        String data = Base64.encodeToString(event.toString().getBytes(StandardCharsets.UTF_8), Base64.NO_WRAP);
        evaluateJavascript("QuestView.decode('" + data + "')", null);
    }
    public void send(String kind, String id, JSONObject payload) {
        JSONObject event = new JSONObject();
        try { event.put("kind", kind); event.put("threadId", id); event.put("payload", payload); } catch (Exception ignored) { }
        send(event);
    }
    public void dispose() { ready = false; stopLoading(); removeJavascriptInterface("T3Quest"); destroy(); }
}
