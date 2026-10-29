package dev.t3quest;

import android.app.Activity;
import android.graphics.Rect;
import android.view.View;
import android.view.WindowManager;
import android.view.WindowMetrics;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=34)
public class SpatialWebViewContextTest {
    @Test public void detachedViewKeepsActivityMetrics() {
        try (var controller = Robolectric.buildActivity(Activity.class).setup()) {
            Activity activity = controller.get();
            View pane = new View(activity);
            var context = new SpatialWebViewContext(activity, pane);
            assertEquals(activity.getWindowManager().getCurrentWindowMetrics().getBounds(),
                    context.getSystemService(WindowManager.class).getCurrentWindowMetrics().getBounds());
        }
    }

    @Test public void attachedChildUsesItsRootBoundsAndPreservesInsetsAcrossResizes() {
        try (var controller = Robolectric.buildActivity(Activity.class).setup().visible()) {
            Activity activity = controller.get();
            View pane = new View(activity);
            activity.setContentView(pane);
            var context = new SpatialWebViewContext(activity, pane);
            WindowManager windows = context.getSystemService(WindowManager.class);
            assertTrue(pane.isAttachedToWindow());
            for (int height : new int[]{780, 480, 350}) {
                pane.getRootView().layout(0, 0, 1000, height);
                WindowMetrics metrics = windows.getCurrentWindowMetrics();
                assertEquals(new Rect(0, 0, 1000, height), metrics.getBounds());
                assertEquals(activity.getWindowManager().getCurrentWindowMetrics().getWindowInsets(), metrics.getWindowInsets());
            }
            assertSame(activity.getSystemService(android.content.Context.INPUT_METHOD_SERVICE),
                    context.getSystemService(android.content.Context.INPUT_METHOD_SERVICE));
        }
    }
}
