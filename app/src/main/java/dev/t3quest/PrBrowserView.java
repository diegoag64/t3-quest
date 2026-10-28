package dev.t3quest;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.view.Gravity;
import android.webkit.*;
import android.widget.*;
import java.io.ByteArrayInputStream;
import java.util.HashMap;

/** Public website surface. Deliberately has no T3Quest JavaScript interface or bridge credentials. */
public final class PrBrowserView extends LinearLayout {
    private final Activity activity;
    private final WebView web;
    private final TextView address, status;
    private final ProgressBar progress;
    private final Button previous;
    private String prRoot;
    private boolean failed, disposed;

    @SuppressLint("SetJavaScriptEnabled")
    public PrBrowserView(Context context, Activity activity, String url, String returnLabel, Runnable close) {
        super(context); this.activity = activity;
        prRoot = GitHubPrUrl.root(url);
        if (prRoot == null) throw new IllegalArgumentException("Expected a GitHub pull request");
        setOrientation(VERTICAL); setBackgroundColor(Color.rgb(12,12,12));
        web = new WebView(context);web.setBackgroundColor(Color.BLACK);
        LinearLayout header = line(context);
        header.addView(button(context,returnLabel,close));
        address = label(context,prRoot.substring("https://github.com/".length()),15);
        address.setMaxLines(1); address.setEllipsize(android.text.TextUtils.TruncateAt.END);
        header.addView(address,new LinearLayout.LayoutParams(0,dp(52),1));
        addView(header);
        HorizontalScrollView controls = new HorizontalScrollView(context); controls.setHorizontalScrollBarEnabled(false);
        LinearLayout bar = line(context); controls.addView(bar);
        previous = button(context,"← Page",this::goBack); previous.setContentDescription("Previous GitHub page");bar.addView(previous);
        bar.addView(button(context,"Conversation",()->navigate(prRoot)));
        bar.addView(button(context,"Files",()->navigate(prRoot+"/files")));
        bar.addView(button(context,"Checks",()->navigate(prRoot+"/checks")));
        bar.addView(button(context,"Reload",()->{failed=false;web.reload();}));
        bar.addView(button(context,"Quest Browser ↗",()->external(web.getUrl()==null?prRoot:web.getUrl(),false)));
        addView(controls,new LinearLayout.LayoutParams(-1,dp(48)));
        status = label(context,"GitHub website · Sign in here to view private repositories.",12);
        status.setTextColor(Color.rgb(160,160,160));addView(status);
        progress = new ProgressBar(context,null,android.R.attr.progressBarStyleHorizontal);
        addView(progress,new LinearLayout.LayoutParams(-1,dp(2)));
        addView(web,new LinearLayout.LayoutParams(-1,0,1));
        WebSettings settings=web.getSettings();
        settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(true);settings.setGeolocationEnabled(false);
        settings.setSupportMultipleWindows(false);settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setUseWideViewPort(true);settings.setLoadWithOverviewMode(true);
        settings.setBuiltInZoomControls(true);settings.setDisplayZoomControls(false);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
        web.setWebChromeClient(new WebChromeClient(){
            @Override public void onProgressChanged(WebView view,int value){progress.setProgress(value);progress.setVisibility(value<100?VISIBLE:GONE);}
            @Override public void onPermissionRequest(PermissionRequest request){request.deny();}
        });
        web.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){
                String target=request.getUrl().toString();
                if(GitHubPrUrl.isGitHub(target))return false;
                if(request.isForMainFrame())external(target,true);
                return true;
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){
                if("https".equals(request.getUrl().getScheme()))return null;
                return new WebResourceResponse("text/plain","UTF-8",403,"Blocked",new HashMap<>(),new ByteArrayInputStream(new byte[0]));
            }
            @Override public void onPageStarted(WebView view,String target,android.graphics.Bitmap icon){
                failed=false;status.setText("Loading GitHub…");address.setText(target.replace("https://",""));previous.setEnabled(view.canGoBack());
            }
            @Override public void onPageFinished(WebView view,String target){
                if(!failed)status.setText("GitHub website · Private PRs need sign-in. Login trouble? Use Quest Browser.");
                previous.setEnabled(view.canGoBack());CookieManager.getInstance().flush();
            }
            @Override public void doUpdateVisitedHistory(WebView view,String target,boolean reload){previous.setEnabled(view.canGoBack());address.setText(target.replace("https://",""));}
            @Override public void onReceivedError(WebView view,WebResourceRequest request,WebResourceError error){if(request.isForMainFrame())showError("GitHub could not load. Check Wi-Fi, then Reload or use Quest Browser.");}
            @Override public void onReceivedSslError(WebView view,SslErrorHandler handler,android.net.http.SslError error){handler.cancel();showError("GitHub's secure connection could not be verified. Check the headset date and network.");}
            @Override public void onReceivedHttpError(WebView view,WebResourceRequest request,WebResourceResponse response){if(request.isForMainFrame())showError(response.getStatusCode()==404?"PR unavailable. For private repositories, sign in to GitHub or use Quest Browser.":"GitHub returned an error. Try Reload or Quest Browser.");}
        });
        web.setDownloadListener((target,agent,disposition,mime,size)->external(target,true));
        navigate(url);
    }
    private void showError(String message){failed=true;status.setText(message);progress.setVisibility(GONE);}
    private void navigate(String url){if(!disposed&&GitHubPrUrl.isGitHub(url))web.loadUrl(url);}
    public boolean goBack(){if(!disposed&&web.canGoBack()){web.goBack();return true;}return false;}
    public void resume(){if(!disposed)web.onResume();}
    public void pause(){if(!disposed)web.onPause();}
    public void dispose(){if(disposed)return;disposed=true;web.stopLoading();removeView(web);web.destroy();}
    private void external(String target,boolean confirm){
        Uri uri=Uri.parse(target);if(!"https".equals(uri.getScheme())||uri.getHost()==null)return;
        Runnable open=()->{try{activity.startActivity(new Intent(Intent.ACTION_VIEW,uri));}catch(Exception error){Toast.makeText(getContext(),"No browser available",Toast.LENGTH_SHORT).show();}};
        if(confirm)new AlertDialog.Builder(getContext()).setTitle("Open in Quest Browser?").setMessage(target).setNegativeButton("Cancel",null).setPositiveButton("Open",(d,w)->open.run()).show();else open.run();
    }
    private int dp(int value){return Math.round(value*getResources().getDisplayMetrics().density);}
    private LinearLayout line(Context context){LinearLayout line=new LinearLayout(context);line.setGravity(Gravity.CENTER_VERTICAL);return line;}
    private TextView label(Context context,String text,int size){TextView label=new TextView(context);label.setText(text);label.setTextSize(size);label.setTextColor(Color.rgb(240,240,240));label.setGravity(Gravity.CENTER_VERTICAL);label.setPadding(dp(10),dp(5),dp(10),dp(5));return label;}
    private Button button(Context context,String text,Runnable click){
        Button button=new Button(context);button.setText(text);button.setTextSize(13);button.setTextColor(Color.WHITE);button.setAllCaps(false);button.setMinHeight(dp(44));
        android.graphics.drawable.GradientDrawable background=new android.graphics.drawable.GradientDrawable();background.setColor(Color.rgb(25,25,25));background.setCornerRadius(dp(8));background.setStroke(dp(1),Color.rgb(45,45,45));button.setBackground(background);
        LinearLayout.LayoutParams params=new LinearLayout.LayoutParams(-2,dp(44));params.setMargins(dp(3),dp(2),dp(3),dp(2));button.setLayoutParams(params);button.setPadding(dp(12),0,dp(12),0);
        button.setOnClickListener(v->click.run());return button;
    }
}
