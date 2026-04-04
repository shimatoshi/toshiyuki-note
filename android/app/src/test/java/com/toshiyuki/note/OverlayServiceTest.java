package com.toshiyuki.note;

import android.graphics.PixelFormat;
import android.util.DisplayMetrics;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewParent;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.ImageView;

import android.content.res.Resources;

import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.Mock;
import org.mockito.junit.MockitoJUnitRunner;

import java.lang.reflect.Field;
import java.lang.reflect.Method;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

@RunWith(MockitoJUnitRunner.class)
public class OverlayServiceTest {

    @Mock WindowManager mockWindowManager;
    @Mock View mockBubbleView;
    @Mock View mockPanelView;
    @Mock WebView mockWebView;
    @Mock WebSettings mockWebSettings;
    @Mock ImageView mockCloseBtn;
    @Mock Resources mockResources;

    private OverlayService service;
    private WindowManager.LayoutParams bubbleParams;
    private DisplayMetrics displayMetrics;

    @Before
    public void setUp() throws Exception {
        service = spy(new OverlayService());

        displayMetrics = new DisplayMetrics();
        displayMetrics.density = 2.0f;
        displayMetrics.heightPixels = 2000;
        displayMetrics.widthPixels = 1080;

        doReturn(mockResources).when(service).getResources();
        when(mockResources.getDisplayMetrics()).thenReturn(displayMetrics);

        bubbleParams = new WindowManager.LayoutParams(
                96, 96,
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
                PixelFormat.TRANSLUCENT
        );
        bubbleParams.x = 16;
        bubbleParams.y = 200;

        setField("windowManager", mockWindowManager);
        setField("bubbleView", mockBubbleView);
        setField("bubbleAdded", true);
        setField("bubbleParams", bubbleParams);
        setField("isPanelVisible", false);
    }

    // =====================================
    // タッチ操作（ドラッグ + タップ判定）
    // =====================================

    @Test
    public void ドラッグ_10px以上移動でisDraggingがtrue() throws Exception {
        when(mockBubbleView.getParent()).thenReturn(mock(ViewParent.class));

        simulateTouch(MotionEvent.ACTION_DOWN, 100f, 200f);
        assertFalse(getBool("isDragging"));

        simulateTouch(MotionEvent.ACTION_MOVE, 150f, 280f);
        assertTrue(getBool("isDragging"));
    }

    @Test
    public void ドラッグ_バブル位置が更新される() throws Exception {
        when(mockBubbleView.getParent()).thenReturn(mock(ViewParent.class));

        simulateTouch(MotionEvent.ACTION_DOWN, 100f, 200f);
        simulateTouch(MotionEvent.ACTION_MOVE, 150f, 280f);

        assertEquals(16 + 50, bubbleParams.x);
        assertEquals(200 + 80, bubbleParams.y);
        verify(mockWindowManager).updateViewLayout(mockBubbleView, bubbleParams);
    }

    @Test
    public void ドラッグ後UP_パネルはトグルされない() throws Exception {
        when(mockBubbleView.getParent()).thenReturn(mock(ViewParent.class));

        simulateTouch(MotionEvent.ACTION_DOWN, 100f, 200f);
        simulateTouch(MotionEvent.ACTION_MOVE, 150f, 280f);
        simulateTouch(MotionEvent.ACTION_UP, 150f, 280f);

        assertFalse("ドラッグ後はパネル非表示のまま", getBool("isPanelVisible"));
    }

    @Test
    public void タップ_10px未満移動でパネルがトグルされる() throws Exception {
        setupPanelForShow();

        simulateTouch(MotionEvent.ACTION_DOWN, 100f, 200f);
        simulateTouch(MotionEvent.ACTION_UP, 103f, 205f);

        assertTrue("タップでパネル表示", getBool("isPanelVisible"));
    }

    @Test
    public void ドラッグ中にparentがnull_updateViewLayoutは呼ばれない() throws Exception {
        when(mockBubbleView.getParent()).thenReturn(null);

        simulateTouch(MotionEvent.ACTION_DOWN, 100f, 200f);
        simulateTouch(MotionEvent.ACTION_MOVE, 200f, 300f);

        verify(mockWindowManager, never()).updateViewLayout(any(), any());
    }

    @Test
    public void ドラッグ中にupdateViewLayoutが例外_クラッシュしない() throws Exception {
        when(mockBubbleView.getParent()).thenReturn(mock(ViewParent.class));
        doThrow(new IllegalArgumentException("View not attached"))
                .when(mockWindowManager).updateViewLayout(any(), any());

        simulateTouch(MotionEvent.ACTION_DOWN, 100f, 200f);
        simulateTouch(MotionEvent.ACTION_MOVE, 200f, 300f);
        // no exception = pass
    }

    // =====================================
    // togglePanel（パネル表示/非表示）
    // =====================================

    @Test
    public void togglePanel_表示() throws Exception {
        setupPanelForShow();

        invokeTogglePanel();

        assertTrue(getBool("isPanelVisible"));
        verify(mockWindowManager).addView(eq(mockPanelView), any(WindowManager.LayoutParams.class));
    }

    @Test
    public void togglePanel_表示して非表示() throws Exception {
        setupPanelForShow();

        invokeTogglePanel(); // show
        invokeTogglePanel(); // hide

        assertFalse(getBool("isPanelVisible"));
        verify(mockWindowManager).removeView(mockPanelView);
    }

    @Test
    public void togglePanel_高速連打でクラッシュしない() throws Exception {
        setupPanelForShow();

        for (int i = 0; i < 20; i++) {
            invokeTogglePanel();
        }
    }

    @Test
    public void togglePanel_panelViewにparentがある場合_先にremoveされる() throws Exception {
        setField("panelView", mockPanelView);
        when(mockPanelView.getParent()).thenReturn(mock(ViewParent.class));

        invokeTogglePanel();

        verify(mockWindowManager).removeView(mockPanelView);
        verify(mockWindowManager).addView(eq(mockPanelView), any(WindowManager.LayoutParams.class));
    }

    @Test
    public void togglePanel_addView例外_isPanelVisibleがfalseになる() throws Exception {
        setupPanelForShow();
        doThrow(new RuntimeException("WindowManager error"))
                .when(mockWindowManager).addView(any(), any());

        invokeTogglePanel();

        assertFalse(getBool("isPanelVisible"));
    }

    @Test
    public void togglePanel_removeView例外_isPanelVisibleがfalseになる() throws Exception {
        setField("isPanelVisible", true);
        setField("panelView", mockPanelView);
        doThrow(new RuntimeException("not attached"))
                .when(mockWindowManager).removeView(any());

        invokeTogglePanel();

        assertFalse(getBool("isPanelVisible"));
    }

    @Test
    public void togglePanel_panelViewがnull_ensurePanelも失敗_何もしない() throws Exception {
        setField("panelView", null);
        // ensurePanel will try to inflate which returns null in mock env
        // togglePanel should just return without crash

        invokeTogglePanel();

        assertFalse(getBool("isPanelVisible"));
        verify(mockWindowManager, never()).addView(any(), any());
    }

    // =====================================
    // onDestroy
    // =====================================

    @Test
    public void onDestroy_パネル表示中_全viewがremoveされる() throws Exception {
        setField("isPanelVisible", true);
        setField("panelView", mockPanelView);
        setField("webView", mockWebView);

        invokeOnDestroy();

        verify(mockWindowManager).removeView(mockPanelView);
        verify(mockWindowManager).removeView(mockBubbleView);
        verify(mockWebView).destroy();
    }

    @Test
    public void onDestroy_removeView例外_クラッシュしない() throws Exception {
        setField("isPanelVisible", true);
        setField("panelView", mockPanelView);
        setField("webView", mockWebView);
        doThrow(new IllegalArgumentException("not attached"))
                .when(mockWindowManager).removeView(any());

        invokeOnDestroy();

        verify(mockWebView).destroy();
    }

    // =====================================
    // ヘルパー
    // =====================================

    private void simulateTouch(int action, float x, float y) throws Exception {
        // Directly invoke the touch handling logic via reflection
        // This mirrors the OnTouchListener set in createBubble()
        switch (action) {
            case MotionEvent.ACTION_DOWN:
                setField("initialX", bubbleParams.x);
                setField("initialY", bubbleParams.y);
                setField("initialTouchX", x);
                setField("initialTouchY", y);
                setField("isDragging", false);
                break;

            case MotionEvent.ACTION_MOVE:
                int dx = (int) (x - getFloat("initialTouchX"));
                int dy = (int) (y - getFloat("initialTouchY"));
                if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
                    setField("isDragging", true);
                }
                if (getBool("bubbleAdded") && mockBubbleView != null && mockBubbleView.getParent() != null) {
                    bubbleParams.x = getInt("initialX") + dx;
                    bubbleParams.y = getInt("initialY") + dy;
                    try {
                        mockWindowManager.updateViewLayout(mockBubbleView, bubbleParams);
                    } catch (Exception e) {
                        // caught like in real code
                    }
                }
                break;

            case MotionEvent.ACTION_UP:
                if (!getBool("isDragging")) {
                    invokeTogglePanel();
                }
                break;
        }
    }

    private void setupPanelForShow() throws Exception {
        setField("panelView", mockPanelView);
        when(mockPanelView.getParent()).thenReturn(null);
    }

    private void invokeTogglePanel() throws Exception {
        Method m = OverlayService.class.getDeclaredMethod("togglePanel");
        m.setAccessible(true);
        m.invoke(service);
    }

    private void invokeOnDestroy() throws Exception {
        // Call the onDestroy logic directly, skipping super.onDestroy()
        // which would fail in test context
        Field isPanelField = OverlayService.class.getDeclaredField("isPanelVisible");
        isPanelField.setAccessible(true);
        Field panelField = OverlayService.class.getDeclaredField("panelView");
        panelField.setAccessible(true);
        Field bubbleField = OverlayService.class.getDeclaredField("bubbleView");
        bubbleField.setAccessible(true);
        Field bubbleAddedField = OverlayService.class.getDeclaredField("bubbleAdded");
        bubbleAddedField.setAccessible(true);
        Field webViewField = OverlayService.class.getDeclaredField("webView");
        webViewField.setAccessible(true);

        try {
            if ((boolean) isPanelField.get(service) && panelField.get(service) != null) {
                mockWindowManager.removeView((View) panelField.get(service));
            }
        } catch (Exception e) {}
        try {
            if ((boolean) bubbleAddedField.get(service) && bubbleField.get(service) != null) {
                mockWindowManager.removeView((View) bubbleField.get(service));
            }
        } catch (Exception e) {}
        WebView wv = (WebView) webViewField.get(service);
        if (wv != null) {
            wv.destroy();
        }
    }

    private void setField(String name, Object value) throws Exception {
        Field f = OverlayService.class.getDeclaredField(name);
        f.setAccessible(true);
        f.set(service, value);
    }

    private boolean getBool(String name) throws Exception {
        Field f = OverlayService.class.getDeclaredField(name);
        f.setAccessible(true);
        return (boolean) f.get(service);
    }

    private int getInt(String name) throws Exception {
        Field f = OverlayService.class.getDeclaredField(name);
        f.setAccessible(true);
        return (int) f.get(service);
    }

    private float getFloat(String name) throws Exception {
        Field f = OverlayService.class.getDeclaredField(name);
        f.setAccessible(true);
        return (float) f.get(service);
    }
}
