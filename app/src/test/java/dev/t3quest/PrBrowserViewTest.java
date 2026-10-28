package dev.t3quest;

import android.app.Activity;
import android.net.Uri;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.*;
import android.widget.Button;
import android.widget.TextView;
import org.junit.*;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.android.controller.ActivityController;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.Assert.*;
import static org.robolectric.Shadows.shadowOf;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=34)
public class PrBrowserViewTest {
    private static final String PR="https://github.com/example/project/pull/42";
    private ActivityController<Activity> controller;
    private Activity activity;
    private PrBrowserView pane;
    private WebView web;
    private AtomicInteger returns;
    @Before public void setUp(){
        controller=Robolectric.buildActivity(Activity.class).setup();activity=controller.get();returns=new AtomicInteger();
        pane=new PrBrowserView(activity,activity,PR,"← Thread",returns::incrementAndGet);
        activity.setContentView(pane);web=(WebView)pane.getChildAt(pane.getChildCount()-1);
    }
    @After public void tearDown(){pane.dispose();controller.pause().stop().destroy();}
    private Button button(View node,String title){
        if(node instanceof Button&&((Button)node).getText().toString().equals(title))return (Button)node;
        if(node instanceof ViewGroup){ViewGroup group=(ViewGroup)node;for(int i=0;i<group.getChildCount();i++){Button found=button(group.getChildAt(i),title);if(found!=null)return found;}}
        return null;
    }
    private boolean hasText(View node,String text){
        if(node instanceof TextView&&((TextView)node).getText().toString().contains(text))return true;
        if(node instanceof ViewGroup){ViewGroup group=(ViewGroup)node;for(int i=0;i<group.getChildCount();i++)if(hasText(group.getChildAt(i),text))return true;}
        return false;
    }
    private WebResourceRequest request(String value){return new WebResourceRequest(){
        public Uri getUrl(){return Uri.parse(value);}public boolean isForMainFrame(){return true;}public boolean isRedirect(){return false;}public boolean hasGesture(){return true;}public String getMethod(){return "GET";}public Map<String,String> getRequestHeaders(){return Map.of();}
    };}
    @Test public void sectionsStayInTheBrowserAndReturnIsExplicit(){
        assertEquals(PR,shadowOf(web).getLastLoadedUrl());
        button(pane,"Files").performClick();assertEquals(PR+"/files",shadowOf(web).getLastLoadedUrl());
        button(pane,"Checks").performClick();assertEquals(PR+"/checks",shadowOf(web).getLastLoadedUrl());
        button(pane,"Conversation").performClick();assertEquals(PR,shadowOf(web).getLastLoadedUrl());
        assertEquals(0,returns.get());button(pane,"← Thread").performClick();assertEquals(1,returns.get());
        assertNull(shadowOf(activity).getNextStartedActivity());
    }
    @Test public void remoteContentCannotAccessTheQuestBridgeOrLocalFiles(){
        assertNull(shadowOf(web).getJavascriptInterface("T3Quest"));
        assertFalse(web.getSettings().getAllowFileAccess());assertFalse(web.getSettings().getAllowContentAccess());
        assertEquals(WebSettings.MIXED_CONTENT_NEVER_ALLOW,web.getSettings().getMixedContentMode());
        assertTrue(web.getWebViewClient().shouldOverrideUrlLoading(web,request("file:///private/token")));
        assertNotNull(web.getWebViewClient().shouldInterceptRequest(web,request("file:///private/token")));
        assertFalse(web.getWebViewClient().shouldOverrideUrlLoading(web,request("https://github.com/login")));
        assertTrue(web.getWebViewClient().shouldOverrideUrlLoading(web,request("https://example.com")));
        assertNull(shadowOf(activity).getNextStartedActivity());
    }
    @Test public void failedLoadsExplainRecoveryAndDoNotDisappearAtPageFinish(){
        web.getWebViewClient().onReceivedError(web,request(PR),null);
        web.getWebViewClient().onPageFinished(web,PR);
        assertTrue(hasText(pane,"Check Wi-Fi"));assertNotNull(button(pane,"Reload"));assertNotNull(button(pane,"Quest Browser ↗"));
    }
    @Test public void fallbackOpensOnlyAfterTheUserChoosesIt(){
        assertNull(shadowOf(activity).getNextStartedActivity());button(pane,"Quest Browser ↗").performClick();
        assertEquals(PR,shadowOf(activity).getNextStartedActivity().getDataString());
    }
}
