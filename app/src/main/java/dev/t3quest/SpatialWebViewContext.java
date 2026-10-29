package dev.t3quest;

import android.content.Context;
import android.content.ContextWrapper;
import android.graphics.Rect;
import android.view.Display;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.view.WindowMetrics;
import androidx.annotation.RequiresApi;

/** Gives Chromium the Layout SDK child's bounds instead of the compact Activity's bounds. */
@RequiresApi(30)
final class SpatialWebViewContext extends ContextWrapper {
    private final WindowManager windows;

    SpatialWebViewContext(Context base, View pane) {
        super(base);
        WindowManager delegate = base.getSystemService(WindowManager.class);
        windows = new WindowManager() {
            @Override public WindowMetrics getCurrentWindowMetrics() {
                WindowMetrics original = delegate.getCurrentWindowMetrics();
                View root = pane.getRootView();
                if (!pane.isAttachedToWindow() || root.getWidth() <= 0 || root.getHeight() <= 0) return original;
                return new WindowMetrics(new Rect(0, 0, root.getWidth(), root.getHeight()), original.getWindowInsets());
            }
            @Override public WindowMetrics getMaximumWindowMetrics() { return delegate.getMaximumWindowMetrics(); }
            @Override public Display getDefaultDisplay() { return delegate.getDefaultDisplay(); }
            @Override public void addView(View view, ViewGroup.LayoutParams params) { delegate.addView(view, params); }
            @Override public void updateViewLayout(View view, ViewGroup.LayoutParams params) { delegate.updateViewLayout(view, params); }
            @Override public void removeView(View view) { delegate.removeView(view); }
            @Override public void removeViewImmediate(View view) { delegate.removeViewImmediate(view); }
        };
    }

    @Override public Object getSystemService(String name) {
        return WINDOW_SERVICE.equals(name) ? windows : super.getSystemService(name);
    }
}
