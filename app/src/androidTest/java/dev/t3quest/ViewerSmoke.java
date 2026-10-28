package dev.t3quest;

import android.app.*;
import android.content.*;
import android.os.*;
import android.view.*;
import android.webkit.WebView;
import android.graphics.*;
import java.io.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;

/** Device smoke test: production list click, real read-only data, and stable parent plus centered Layout SDK child window. */
public class ViewerSmoke extends Instrumentation {
  private Bundle args;
  @Override public void onCreate(Bundle input){super.onCreate(input);args=input;start();}
  private WebView web(View view){if(view instanceof WebView)return (WebView)view;if(view instanceof ViewGroup){ViewGroup g=(ViewGroup)view;for(int i=0;i<g.getChildCount();i++){WebView w=web(g.getChildAt(i));if(w!=null)return w;}}return null;}
  private WebView readingWeb(Activity activity){
    if(activity instanceof MainActivity){WebView child=((MainActivity)activity).readingWindowHost().readerView();if(child!=null)return child;}
    return web(activity.getWindow().getDecorView());
  }
  private String js(Activity activity,String code)throws Exception{CountDownLatch done=new CountDownLatch(1);AtomicReference<String> value=new AtomicReference<>();runOnMainSync(()->{WebView w=readingWeb(activity);if(w==null){done.countDown();return;}w.evaluateJavascript(code,r->{value.set(r);done.countDown();});});if(!done.await(5,TimeUnit.SECONDS))throw new Exception("WebView response timeout");return value.get();}
  private void await(Activity activity,String code)throws Exception{for(int i=0;i<40;i++){if("true".equals(js(activity,code)))return;Thread.sleep(500);}throw new Exception("Viewer condition timeout: "+code);}
  private String size(Activity a){AtomicReference<String> result=new AtomicReference<>();runOnMainSync(()->{View v=a.getWindow().getDecorView();result.set(v.getWidth()+"x"+v.getHeight()+" @ "+a.getResources().getDisplayMetrics().density+" density");});return result.get();}
  private void capture(Activity a,String name)throws Exception{AtomicReference<Exception> error=new AtomicReference<>();runOnMainSync(()->{try{View v=readingWeb(a).getRootView();Bitmap b=Bitmap.createBitmap(v.getWidth(),v.getHeight(),Bitmap.Config.ARGB_8888);v.draw(new Canvas(b));try(FileOutputStream out=new FileOutputStream(new File(a.getFilesDir(),name))){b.compress(Bitmap.CompressFormat.PNG,100,out);}b.recycle();}catch(Exception e){error.set(e);}});if(error.get()!=null)throw error.get();}
  private String geometry(Activity a){AtomicReference<String> result=new AtomicReference<>();runOnMainSync(()->{android.graphics.Point screen=new android.graphics.Point();a.getWindowManager().getDefaultDisplay().getRealSize(screen);result.set("task="+a.getTaskId()+", display="+a.getWindowManager().getDefaultDisplay().getDisplayId()+", displayPx="+screen.x+"x"+screen.y+", view="+a.getWindow().getDecorView().getWidth()+"x"+a.getWindow().getDecorView().getHeight());});return result.get();}
  private void resizeProbe(Activity a)throws Exception{
    StringBuilder report=new StringBuilder("Resize probe on existing panel\n");
    final WindowManager.LayoutParams original=new WindowManager.LayoutParams();
    runOnMainSync(()->original.copyFrom(a.getWindow().getAttributes()));
    report.append("baseline: ").append(geometry(a)).append('\n');
    float density=a.getResources().getDisplayMetrics().density;final int w=Math.round(1000*density),h=Math.round(780*density);
    try{
      runOnMainSync(()->a.getWindow().setLayout(w,h));Thread.sleep(2000);
      report.append("Window.setLayout ").append(w).append('x').append(h).append(": ").append(geometry(a)).append('\n');
    }finally{runOnMainSync(()->a.getWindow().setAttributes(original));}
    Thread.sleep(500);
    ActivityOptions bounds=ActivityOptions.makeBasic().setLaunchBounds(new Rect(0,0,w,h));
    runOnMainSync(()->a.startActivity(new Intent(a,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP|Intent.FLAG_ACTIVITY_CLEAR_TOP),bounds.toBundle()));
    Thread.sleep(2000);
    report.append("ActivityOptions.setLaunchBounds: ").append(geometry(a)).append(", originalDestroyed=").append(a.isDestroyed()).append('\n');
    Bundle result=new Bundle();result.putString("stream",report.toString());finish(Activity.RESULT_OK,result);
  }
  @Override public void onStart(){Bundle result=new Bundle();try{
    Activity compact=startActivitySync(new Intent(getTargetContext(),MainActivity.class).setAction(Intent.ACTION_MAIN).addCategory("com.oculus.intent.category.OVERLAY_LAUNCHER").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
    if(args!=null && "true".equals(args.getString("resizeProbe"))){await(compact,"!!document.querySelector('.sidebar')");resizeProbe(compact);return;}
    await(compact,"!!document.querySelector('.thread-row')");result.putString("compact",size(compact));capture(compact,"viewer-compact.png");
    final int task=compact.getTaskId(), display=compact.getDisplay().getDisplayId();
    final View originalDecor=compact.getWindow().getDecorView();final WebView originalWeb=web(originalDecor);
    final String originalSize=size(compact);
    for(int cycle=0;cycle<2;cycle++){
      js(compact,"window.viewerNavigationSentinel='same-document';document.querySelector('.thread-row').click();true");
      await(compact,"!!document.querySelector('.top-state.live') && !!document.querySelector('.entry')");
      String layout=js(compact,"JSON.stringify({viewport:[innerWidth,innerHeight],items:QuestTest.state.items.length,entries:document.querySelectorAll('.entry').length,boxes:['#app','.workspace-body','.conversation','.timeline-scroll','.timeline','.footer'].map(s=>{const n=document.querySelector(s),r=n.getBoundingClientRect(),c=getComputedStyle(n);return {selector:s,width:r.width,height:r.height,top:r.top,scrollHeight:n.scrollHeight,scrollTop:n.scrollTop,display:c.display,flex:c.flex,minHeight:c.minHeight}})})");
      Bundle status=new Bundle();status.putString("stream","Reader layout: "+layout+"\n");sendStatus(0,status);
      if(args!=null && "true".equals(args.getString("layoutProbe"))){result.putString("stream",layout+"\n");finish(Activity.RESULT_OK,result);return;}
      if(!"true".equals(js(compact,"document.querySelector('#app').clientHeight>=innerHeight-2 && document.querySelector('.timeline-scroll').clientHeight>150")))throw new Exception("Conversation viewport collapsed: "+layout);
      String visibleEntry="(()=>{const box=document.querySelector('.timeline-scroll').getBoundingClientRect();return [...document.querySelectorAll('.timeline .entry')].some(n=>{const r=n.getBoundingClientRect();return r.height>0 && r.bottom>box.top && r.top<box.bottom;});})()";
      await(compact,visibleEntry);
      js(compact,"document.querySelector('.timeline-scroll').scrollTop=0;true");
      await(compact,visibleEntry);
      if(cycle==0 && "true".equals(js(compact,"!!document.querySelector('.older')"))){
        js(compact,"document.querySelector('.older').click();true");
        await(compact,"QuestTest.state.historyLoaded && !QuestTest.state.loadingHistory");
        await(compact,visibleEntry);
      }
      js(compact,"document.querySelector('.timeline-scroll').scrollTop=document.querySelector('.timeline-scroll').scrollHeight;true");
      await(compact,visibleEntry);
      ReadingWindowHost host=((MainActivity)compact).readingWindowHost();
      boolean spatial=host.isOpen() && host.readerView()!=null;
      if(args!=null && "true".equals(args.getString("requireSpatial")) && !spatial)throw new Exception("Spatial window unavailable: "+host.placementState());
      if(compact.isDestroyed()||compact.getTaskId()!=task||compact.getDisplay().getDisplayId()!=display||web(compact.getWindow().getDecorView())!=originalWeb)throw new Exception("Navigation replaced the parent panel or WebView");
      if(!originalSize.equals(size(compact)))throw new Exception("Navigation changed parent panel bounds");
      if(spatial){
        if(!"Active".equals(host.placementState()))throw new Exception("Child window is not active: "+host.placementState());
        if(host.readerView().getWidth()<=originalWeb.getWidth())throw new Exception("Reader is not wider than list");
        result.putString("reader",host.readerView().getWidth()+"x"+host.readerView().getHeight());
      }
      if(!"true".equals(js(compact,"!document.querySelector('.composer input,.composer textarea,.composer button')")))throw new Exception("Composer exposes an input");
      capture(compact,"viewer-expanded.png");
      js(compact,"document.querySelector('[aria-label=\"Back to threads\"]').click();true");
      await(compact,"!!document.querySelector('.list-only .thread-row')");
      if(host.isOpen()||host.readerView()!=null)throw new Exception("Back did not release reader");
      if(compact.isDestroyed()||compact.getTaskId()!=task||compact.getDisplay().getDisplayId()!=display||web(compact.getWindow().getDecorView())!=originalWeb||!originalSize.equals(size(compact)))throw new Exception("Back replaced or resized the parent panel");
      if(!"true".equals(js(compact,"window.viewerNavigationSentinel==='same-document'")))throw new Exception("Parent document reloaded");
      result.putString("mode",spatial?"Layout SDK child":"Inline fallback");
    }
    result.putString("returned",size(compact));result.putString("stream","PASS: two read-only open/back cycles, stable parent task/display/size/document, reader cleanup, visible scrollable history. Mode: "+result.getString("mode")+". Physical centering requires headset review.\n");finish(Activity.RESULT_OK,result);
  }catch(Exception e){result.putString("stream","FAIL: "+e+"\n");finish(Activity.RESULT_CANCELED,result);}}
}
