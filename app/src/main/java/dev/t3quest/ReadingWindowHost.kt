package dev.t3quest

import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import metavrx.layout.compose.LocalSpatialSupported
import metavrx.layout.compose.SpatialScene
import metavrx.layout.window.compose.SpatialWindow
import metavrx.layout.window.compose.layout.*
import metavrx.layout.window.compose.state.*
import org.json.JSONObject
import java.util.function.Consumer

/** One activity, a persistent compact parent, and one centered, disposable reading window. */
class ReadingWindowHost(
    private val activity: ComponentActivity,
    root: View,
    private val openInline: Consumer<String>,
    private val openInlinePr: Consumer<String>,
    private val onClose: Runnable,
) {
    private var selected by mutableStateOf<String?>(null)
    private var prUrl by mutableStateOf<String?>(null)
    private var browser: PrBrowserView? = null
    private var browserUrl: String? = null
    private var resumed = false
    private var disposed = false
    private var list = JSONObject()
    private var reader: ThreadWebView? = null
    private var controller: ThreadController? = null
    private var placement = "Closed"

    init {
        activity.setContent {
            SpatialScene {
                Box(Modifier.fillMaxSize()) {
                    // This view and its document never leave the original window.
                    AndroidView(factory = { root }, modifier = Modifier.fillMaxSize())
                    if (selected != null || prUrl != null) ReadingWindow()
                }
            }
        }
    }

    @Composable
    private fun ReadingWindow() {
        val state = rememberWindowState()
        val phase by state.lifecycle.collectAsState()
        val supported = LocalSpatialSupported.current
        LaunchedEffect(supported, phase) {
            placement = if (supported) phase.toString() else "Unsupported"
            Log.i("T3ReadingWindow", placement)
            when {
                !supported || phase is WindowLifecycle.Failure.Rejected ||
                    phase == WindowLifecycle.Pending || phase == WindowLifecycle.Preempted -> {
                    // Preserve access without launching another Android task or shifting the parent.
                    val id = selected
                    val url = prUrl
                    close()
                    if (id != null) openInline.accept(id)
                    if (url != null) openInlinePr.accept(url)
                }
                phase == WindowLifecycle.ExternallyRemoved -> onClose.run()
            }
        }
        SpatialWindow(
            key = "thread-reader",
            modifier = WindowModifier.size(1000.dp, 780.dp)
                .anchor(WindowAnchor.Center).offset(z = OffsetStep.Near),
            windowState = state,
            fallbackStrategy = WindowFallback.Drop,
        ) {
            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = { context ->
                    val pane = FrameLayout(context)
                    pane.layoutParams = ViewGroup.LayoutParams(-1, -1)
                    val web = ThreadWebView(context, activity, "thread", selected) { action, payload ->
                        if (!disposed && isOpen()) {
                            when (action) {
                                "compact" -> onClose.run()
                                "openThread" -> open(payload.optString("id"))
                                else -> controller?.action(action, payload)
                            }
                        }
                    }.also { web ->
                        // WebView uses LayoutParams, not only Compose's measured bounds, to
                        // decide whether it has a fixed viewport for CSS percentage/vh sizing.
                        web.layoutParams = ViewGroup.LayoutParams(
                            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT,
                        )
                        reader = web
                        controller = ThreadController(activity, web, ::openPr).also { c ->
                            selected?.let { c.open(it) }
                            if (resumed) c.resume()
                        }
                        web.send("list", null, list)
                    }
                    pane.addView(web)
                    pane
                },
                update = { pane ->
                    val url = prUrl
                    if (url != null && browserUrl != url) {
                        browser?.let { pane.removeView(it); it.dispose() }
                        controller?.pause()
                        reader?.visibility = View.GONE
                        browser = PrBrowserView(pane.context, activity, url,
                            if (selected == null) "← Threads" else "← Thread", ::closePr, true).also {
                            pane.addView(it, FrameLayout.LayoutParams(-1, -1))
                            if (!resumed) it.pause()
                        }
                        browserUrl = url
                    } else if (url == null && browser != null) {
                        browser?.let { pane.removeView(it); it.dispose() }
                        browser = null; browserUrl = null
                        reader?.visibility = View.VISIBLE
                        if (resumed) controller?.resume()
                    }
                },
                onRelease = { pane ->
                    browser?.takeIf { it.parent === pane }?.let { it.dispose(); browser = null; browserUrl = null }
                    (pane.getChildAt(0) as? ThreadWebView)?.let { releaseReader(it) }
                },
            )
        }
    }

    fun open(id: String) {
        if (disposed || id.isEmpty() || id.length > 2000 || id.startsWith("demo-")) return
        selected = id
        prUrl = null
        controller?.open(id)
    }
    fun openPr(url: String) {
        if (!disposed && GitHubPrUrl.root(url) != null) prUrl = url
    }
    private fun closePr() { if (selected == null) onClose.run() else prUrl = null }
    fun backFromPr(): Boolean {
        if (prUrl == null) return false
        if (browser?.goBack() != true) closePr()
        return true
    }
    fun close() {
        selected = null
        prUrl = null
        controller?.pause()
    }
    fun isOpen() = selected != null || prUrl != null
    fun selectedThread() = selected
    fun placementState() = placement
    fun readerView() = reader
    fun sendList(data: JSONObject) {
        list = data
        reader?.send("list", null, data)
    }
    fun resume() { resumed = true; if (prUrl == null) controller?.resume(); browser?.resume() }
    fun pause() { resumed = false; controller?.pause(); browser?.pause() }
    private fun releaseReader(web: ThreadWebView) {
        if (reader === web) {
            controller?.dispose()
            controller = null
            reader = null
        }
        web.dispose()
    }
    fun dispose() {
        disposed = true
        close()
        controller?.dispose()
        controller = null
        // AndroidView.onRelease owns the WebView's destruction after it is detached.
    }
}
