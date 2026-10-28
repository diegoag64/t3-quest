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
  private WebView prWeb(View node){if(node instanceof PrBrowserView)return web(node);if(node instanceof ViewGroup){ViewGroup group=(ViewGroup)node;for(int i=0;i<group.getChildCount();i++){WebView found=prWeb(group.getChildAt(i));if(found!=null)return found;}}return null;}
  private android.widget.Button button(View node,String label){if(node instanceof android.widget.Button&&label.contentEquals(((android.widget.Button)node).getText()))return (android.widget.Button)node;if(node instanceof ViewGroup){ViewGroup group=(ViewGroup)node;for(int i=0;i<group.getChildCount();i++){android.widget.Button found=button(group.getChildAt(i),label);if(found!=null)return found;}}return null;}
  private String browserJs(WebView web,String code)throws Exception{CountDownLatch done=new CountDownLatch(1);AtomicReference<String> result=new AtomicReference<>();runOnMainSync(()->web.evaluateJavascript(code,value->{result.set(value);done.countDown();}));if(!done.await(5,TimeUnit.SECONDS))throw new Exception("PR browser timed out");return result.get();}
  private void awaitBrowser(WebView web,String condition)throws Exception{for(int i=0;i<60;i++){if("true".equals(browserJs(web,condition)))return;Thread.sleep(500);}throw new Exception("GitHub page did not become ready");}
  private void subagentProbe(Activity activity)throws Exception{
    WebView original=readingWeb(activity);
    await(activity,"!!document.querySelector('[data-child-thread-id]')");
    js(activity,"(()=>{const card=document.querySelector('[data-child-thread-id]');for(let node=card.parentElement;node;node=node.parentElement)if(node.tagName==='DETAILS')node.open=true;card.scrollIntoView({block:'center'});window.viewerParent={id:QuestTest.state.selected,scroll:document.querySelector('.timeline-scroll').scrollTop,draft:document.querySelector('.draft-input').value};window.viewerChildId=card.dataset.childThreadId;card.click();return true;})()");
    await(activity,"QuestTest.state.selected===window.viewerChildId && QuestTest.state.detail?.thread?.id===window.viewerChildId && !!document.querySelector('.top-state.live') && QuestTest.state.items.length>0");
    if(readingWeb(activity)!=original)throw new Exception("Subagent navigation replaced the reader WebView");
    await(activity,"!!document.querySelector('[aria-label=\"Back to parent thread\"]')");
    await(activity,"document.querySelector('.topbar').getBoundingClientRect().top>=0 && document.querySelector('.timeline-scroll').clientHeight>150");
    Thread.sleep(250); // Capture the child's painted frame, not the prior thread's backing buffer.
    capture(activity,"viewer-subagent.png");
    runOnMainSync(activity::onBackPressed);
    await(activity,"QuestTest.state.selected===window.viewerParent.id && QuestTest.state.detail?.thread?.id===window.viewerParent.id && document.querySelector('.draft-input').value===window.viewerParent.draft && Math.abs(document.querySelector('.timeline-scroll').scrollTop-window.viewerParent.scroll)<2");
    if(readingWeb(activity)!=original)throw new Exception("Parent return replaced the reader WebView");
  }
  private void prProbe(Activity activity,String url)throws Exception{
    String root=GitHubPrUrl.root(url);if(root==null)throw new Exception("prUrl must identify a GitHub PR");
    WebView original=readingWeb(activity);View pane=(View)original.getParent();
    js(activity,"window.prSmokeDraft=document.querySelector('.draft-input').value;document.querySelector('.timeline-scroll').scrollTop=0;window.T3Quest.request('openPr',JSON.stringify({url:"+org.json.JSONObject.quote(root)+"}));true");
    AtomicReference<WebView> target=new AtomicReference<>();
    for(int i=0;i<40&&target.get()==null;i++){runOnMainSync(()->target.set(prWeb(pane)));if(target.get()==null)Thread.sleep(250);}
    WebView browser=target.get();if(browser==null)throw new Exception("PR browser did not open in reader");
    String loaded="document.readyState==='complete' && document.title.includes('Pull Request #') && typeof T3Quest==='undefined'";
    awaitBrowser(browser,loaded);
    for(String section:new String[]{"Files","Checks","Conversation"}){
      runOnMainSync(()->button(pane,section).performClick());
      String path=root+(section.equals("Files")?"/files":section.equals("Checks")?"/checks":"");
      awaitBrowser(browser,loaded+" && location.href.split('?')[0].split('#')[0]==="+org.json.JSONObject.quote(path));
    }
    capture(activity,"viewer-pr-browser.png");
    runOnMainSync(()->button(pane,"← Thread").performClick());
    await(activity,"document.querySelector('.draft-input').value===window.prSmokeDraft && document.querySelector('.timeline-scroll').scrollTop<2");
    AtomicReference<Boolean> retained=new AtomicReference<>();runOnMainSync(()->retained.set(readingWeb(activity)==original&&original.getVisibility()==View.VISIBLE&&prWeb(pane)==null));
    if(!retained.get())throw new Exception("PR return did not retain the reader");
  }
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
    String draftId="test-"+java.util.UUID.randomUUID();
    Context context=getTargetContext();
    try{
      VoiceDrafts.text(context,draftId,"Draft persistence check");
      String requestId=VoiceDrafts.read(context,draftId).getString("requestId");
      VoiceDrafts.update(context,draftId,"uncertain","Test interrupted delivery");
      if(!VoiceDrafts.read(context,draftId).getString("text").equals("Draft persistence check")||!VoiceDrafts.read(context,draftId).getString("requestId").equals(requestId))throw new Exception("Draft or retry identity was lost");
      if(!context.getSharedPreferences("drafts",0).getString(draftId,"").contains("Draft persistence check"))throw new Exception("Draft was not persisted");
    }finally{context.getSharedPreferences("drafts",0).edit().remove(draftId).commit();}
    Activity compact=startActivitySync(new Intent(getTargetContext(),MainActivity.class).setAction(Intent.ACTION_MAIN).addCategory("com.oculus.intent.category.OVERLAY_LAUNCHER").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
    if(args!=null && "true".equals(args.getString("resizeProbe"))){await(compact,"!!document.querySelector('.sidebar')");resizeProbe(compact);return;}
    await(compact,"!!document.querySelector('.thread-row')");result.putString("compact",size(compact));capture(compact,"viewer-compact.png");
    final int task=compact.getTaskId(), display=compact.getDisplay().getDisplayId();
    final View originalDecor=compact.getWindow().getDecorView();final WebView originalWeb=web(originalDecor);
    final String originalSize=size(compact);
    org.json.JSONArray environments=null;
    if(args!=null&&args.getString("requireEnvironments")!=null){
      int minimum=Integer.parseInt(args.getString("requireEnvironments"));
      await(compact,"new Set([...QuestTest.state.threads,...QuestTest.state.settledThreads].filter(t=>t.environmentConnected).map(t=>t.environmentId).filter(Boolean)).size>="+minimum);
      String encoded=js(compact,"JSON.stringify([...new Set([...QuestTest.state.threads,...QuestTest.state.settledThreads].filter(t=>t.environmentConnected).map(t=>t.environmentId).filter(Boolean))])");
      environments=new org.json.JSONArray((String)new org.json.JSONTokener(encoded).nextValue());
    }
    int cycles=environments==null?2:Math.max(2,environments.length());
    for(int cycle=0;cycle<cycles;cycle++){
      String expectedThread=null;
      if(environments!=null){
        String environment=org.json.JSONObject.quote(environments.getString(cycle%environments.length()));
        js(compact,"(()=>{const filter=document.querySelector('[aria-label=\"Filter by environment\"]');filter.value="+environment+";filter.dispatchEvent(new Event('change'));const settled=document.querySelector('.settled');if(settled)settled.open=true;return true;})()");
        await(compact,"QuestTest.state.environment==="+environment+" && !!document.querySelector('.thread-row') && [...document.querySelectorAll('.thread-row')].every(row=>[...QuestTest.state.threads,...QuestTest.state.settledThreads].some(t=>t.id===row.dataset.threadId&&t.environmentId==="+environment+"))");
        expectedThread=js(compact,"document.querySelector('.thread-row').dataset.threadId");
      }
      String target=args==null?null:args.getString("threadId");
      String row=target==null?"document.querySelector('.thread-row')":"[...document.querySelectorAll('.thread-row')].find(row=>row.dataset.threadId==="+org.json.JSONObject.quote(target)+")";
      js(compact,"window.viewerNavigationSentinel='same-document';"+row+".click();true");
      await(compact,"!!document.querySelector('.top-state.live') && !!document.querySelector('.entry')");
      if(expectedThread!=null)await(compact,"QuestTest.state.selected==="+expectedThread+" && QuestTest.state.detail?.thread?.id==="+expectedThread+" && QuestTest.state.items.length>0");
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
      if(!"true".equals(js(compact,"!!document.querySelector('.draft-input') && (!!document.querySelector('.draft-input').value.trim() || document.querySelector('.draft-send').disabled)")))throw new Exception("Composer missing or empty draft allows sending");
      capture(compact,"viewer-expanded.png");
      if(cycle==0&&args!=null&&"true".equals(args.getString("requireSubagent"))){subagentProbe(compact);result.putString("subagent","PASS: child history, same reader, hardware Back restores parent draft and scroll");}
      if(cycle==0&&args!=null&&args.getString("prUrl")!=null){prProbe(compact,args.getString("prUrl"));result.putString("prBrowser","PASS: GitHub conversation/files/checks, no T3 interface, retained reader and draft");}
      js(compact,"document.querySelector('[aria-label=\"Back to threads\"]').click();true");
      await(compact,"!!document.querySelector('.list-only .thread-row')");
      if(host.isOpen()||host.readerView()!=null)throw new Exception("Back did not release reader");
      if(compact.isDestroyed()||compact.getTaskId()!=task||compact.getDisplay().getDisplayId()!=display||web(compact.getWindow().getDecorView())!=originalWeb||!originalSize.equals(size(compact)))throw new Exception("Back replaced or resized the parent panel");
      if(!"true".equals(js(compact,"window.viewerNavigationSentinel==='same-document'")))throw new Exception("Parent document reloaded");
      result.putString("mode",spatial?"Layout SDK child":"Inline fallback");
    }
    if(environments!=null){
      js(compact,"(()=>{const filter=document.querySelector('[aria-label=\"Filter by environment\"]');filter.value='';filter.dispatchEvent(new Event('change'));return true;})()");
      await(compact,"QuestTest.state.environment==='' && document.querySelector('[aria-label=\"Filter by environment\"]').value===''");
      Thread.sleep(250); // Let WebView paint the restored filter before the screenshot.
      capture(compact,"viewer-environments.png");
      result.putString("environments","PASS: filtered and read history from "+environments.length()+" connected environments");
    }
    result.putString("returned",size(compact));result.putString("stream","PASS: "+cycles+" open/back cycles, stable parent task/display/size/document, reader cleanup, visible scrollable history. Mode: "+result.getString("mode")+". Physical centering requires headset review. "+result.getString("prBrowser","")+" "+result.getString("environments","")+" "+result.getString("subagent","")+"\n");finish(Activity.RESULT_OK,result);
  }catch(Exception e){result.putString("stream","FAIL: "+e+"\n");finish(Activity.RESULT_CANCELED,result);}}
}
