package dev.t3quest

import android.util.Log
import android.view.View
import android.view.ViewGroup
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
    private val onClose: Runnable,
) {
    private var selected by mutableStateOf<String?>(null)
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
                    if (selected != null) ReadingWindow()
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
                    close()
                    if (id != null) openInline.accept(id)
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
                    ThreadWebView(context, activity, "thread", selected) { action, payload ->
                        if (!disposed && selected != null) {
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
                        controller = ThreadController(activity, web).also { c ->
                            selected?.let { c.open(it) }
                            if (resumed) c.resume()
                        }
                        web.send("list", null, list)
                    }
                },
                onRelease = { web -> releaseReader(web) },
            )
        }
    }

    fun open(id: String) {
        if (disposed || id.isEmpty() || id.length > 2000 || id.startsWith("demo-")) return
        selected = id
        controller?.open(id)
    }
    fun close() {
        selected = null
        controller?.pause()
    }
    fun isOpen() = selected != null
    fun selectedThread() = selected
    fun placementState() = placement
    fun readerView() = reader
    fun sendList(data: JSONObject) {
        list = data
        reader?.send("list", null, data)
    }
    fun resume() { resumed = true; controller?.resume() }
    fun pause() { resumed = false; controller?.pause() }
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
