package com.toshiyuki.note;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.graphics.PixelFormat;
import android.os.Build;
import android.os.IBinder;
import android.provider.Settings;
import android.util.DisplayMetrics;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ImageView;

import androidx.core.app.NotificationCompat;

public class OverlayService extends Service {

    private static final String CHANNEL_ID = "overlay_channel";
    private static final int NOTIFICATION_ID = 1;

    private final DebugLogger logger = new DebugLogger();
    private WindowManager windowManager;

    // Bubble state
    private View bubbleView;
    private WindowManager.LayoutParams bubbleParams;
    private boolean bubbleAdded = false;
    private int initialX, initialY;
    private float initialTouchX, initialTouchY;
    private boolean isDragging = false;

    // Panel state
    private View panelView;
    private WebView webView;
    private WindowManager.LayoutParams panelParams;
    private boolean isPanelVisible = false;
    private int panelDragStartX, panelDragStartY;

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onCreate() {
        super.onCreate();
        logger.init(this);
        logger.log("onCreate");

        createNotificationChannel();
        startForeground(NOTIFICATION_ID, buildNotification());

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) {
            logger.log("No overlay permission, stopping service");
            stopSelf();
            return;
        }

        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);

        try {
            createBubble();
        } catch (Exception e) {
            logger.log("Failed to create bubble: " + e.getMessage());
            stopSelf();
            return;
        }

        logger.registerReceiver(this, cmd -> {
            if ("toggle".equals(cmd)) togglePanel();
            else if ("status".equals(cmd)) {
                logger.log("STATUS: bubbleAdded=" + bubbleAdded
                        + " isPanelVisible=" + isPanelVisible
                        + " panelView=" + panelView);
            }
        });
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        logger.log("onDestroy");
        logger.unregisterReceiver(this);
        safeRemoveView(isPanelVisible ? panelView : null);
        safeRemoveView(bubbleAdded ? bubbleView : null);
        if (webView != null) webView.destroy();
        super.onDestroy();
    }

    // ==========================================
    // Notification
    // ==========================================

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID, "toshiyuki-note オーバーレイ", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("フローティングメモ機能");
            NotificationManager mgr = getSystemService(NotificationManager.class);
            if (mgr != null) mgr.createNotificationChannel(channel);
        }
    }

    private Notification buildNotification() {
        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("toshiyuki-note")
                .setContentText("フローティングメモ起動中")
                .setSmallIcon(R.mipmap.ic_launcher)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setOngoing(true)
                .build();
    }

    // ==========================================
    // Bubble
    // ==========================================

    private void createBubble() {
        bubbleView = LayoutInflater.from(this).inflate(R.layout.overlay_bubble, null);

        bubbleParams = new WindowManager.LayoutParams(
                dpToPx(48), dpToPx(48), getOverlayType(),
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE, PixelFormat.TRANSLUCENT);
        bubbleParams.gravity = Gravity.TOP | Gravity.START;
        bubbleParams.x = dpToPx(8);
        bubbleParams.y = dpToPx(100);

        windowManager.addView(bubbleView, bubbleParams);
        bubbleAdded = true;

        bubbleView.setOnTouchListener((v, event) -> {
            switch (event.getAction()) {
                case MotionEvent.ACTION_DOWN:
                    initialX = bubbleParams.x;
                    initialY = bubbleParams.y;
                    initialTouchX = event.getRawX();
                    initialTouchY = event.getRawY();
                    isDragging = false;
                    return true;
                case MotionEvent.ACTION_MOVE:
                    int dx = (int) (event.getRawX() - initialTouchX);
                    int dy = (int) (event.getRawY() - initialTouchY);
                    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) isDragging = true;
                    if (bubbleAdded && bubbleView.getParent() != null) {
                        bubbleParams.x = initialX + dx;
                        bubbleParams.y = initialY + dy;
                        try { windowManager.updateViewLayout(bubbleView, bubbleParams); }
                        catch (Exception e) { /* view detached */ }
                    }
                    return true;
                case MotionEvent.ACTION_UP:
                    if (!isDragging) togglePanel();
                    return true;
            }
            return false;
        });
    }

    // ==========================================
    // Panel
    // ==========================================

    private void ensurePanel() {
        if (panelView != null) return;
        try {
            panelView = LayoutInflater.from(this).inflate(R.layout.overlay_panel, null);
            webView = panelView.findViewById(R.id.overlay_webview);

            WebSettings settings = webView.getSettings();
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);
            settings.setCacheMode(WebSettings.LOAD_DEFAULT);
            settings.setAllowFileAccess(true);
            settings.setAllowContentAccess(true);

            webView.setWebViewClient(new WebViewClient());
            webView.setWebChromeClient(new WebChromeClient() {
                @Override
                public boolean onConsoleMessage(android.webkit.ConsoleMessage cm) {
                    logger.log("JS[" + cm.messageLevel().name() + "] " + cm.message()
                            + " (" + cm.sourceId() + ":" + cm.lineNumber() + ")");
                    return true;
                }
                @Override
                public void onGeolocationPermissionsShowPrompt(String origin,
                        android.webkit.GeolocationPermissions.Callback callback) {
                    callback.invoke(origin, true, false);
                }
            });

            webView.addJavascriptInterface(new NotesBridge(this, webView), "NotesBridge");
            webView.loadUrl("file:///android_asset/public/overlay.html");

            ImageView closeBtn = panelView.findViewById(R.id.overlay_close_btn);
            closeBtn.setOnClickListener(v -> togglePanel());
        } catch (Exception e) {
            logger.log("ensurePanel FAILED: " + e.getClass().getName() + ": " + e.getMessage());
            java.io.StringWriter sw = new java.io.StringWriter();
            e.printStackTrace(new java.io.PrintWriter(sw));
            logger.log("ensurePanel stacktrace: " + sw);
            panelView = null;
            webView = null;
        }
    }

    private void togglePanel() {
        try {
            if (isPanelVisible) {
                windowManager.removeView(panelView);
                isPanelVisible = false;
            } else {
                ensurePanel();
                if (panelView == null) return;
                if (panelView.getParent() != null) windowManager.removeView(panelView);

                DisplayMetrics metrics = getResources().getDisplayMetrics();
                int panelHeight = Math.min(dpToPx(280), metrics.heightPixels / 2);
                int panelWidth = (int) (metrics.widthPixels * 0.6);

                panelParams = new WindowManager.LayoutParams(
                        panelWidth, panelHeight, getOverlayType(),
                        WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL, PixelFormat.TRANSLUCENT);
                panelParams.gravity = Gravity.TOP | Gravity.START;
                panelParams.x = metrics.widthPixels - panelWidth;
                panelParams.y = metrics.heightPixels - panelHeight;

                windowManager.addView(panelView, panelParams);
                isPanelVisible = true;
                setupPanelDragHandle();
            }
        } catch (Exception e) {
            logger.log("togglePanel error: " + e.getMessage());
            isPanelVisible = false;
        }
    }

    private void setupPanelDragHandle() {
        View handle = panelView.findViewById(R.id.overlay_drag_handle);
        if (handle == null) return;

        handle.setOnTouchListener((v, event) -> {
            switch (event.getAction()) {
                case MotionEvent.ACTION_DOWN:
                    panelDragStartX = (int) event.getRawX();
                    panelDragStartY = (int) event.getRawY();
                    return true;
                case MotionEvent.ACTION_MOVE:
                    panelParams.x += (int) event.getRawX() - panelDragStartX;
                    panelParams.y += (int) event.getRawY() - panelDragStartY;
                    panelDragStartX = (int) event.getRawX();
                    panelDragStartY = (int) event.getRawY();

                    DisplayMetrics m = getResources().getDisplayMetrics();
                    panelParams.x = Math.max(-panelParams.width / 2, Math.min(m.widthPixels - panelParams.width / 2, panelParams.x));
                    panelParams.y = Math.max(0, Math.min(m.heightPixels - dpToPx(60), panelParams.y));

                    try { windowManager.updateViewLayout(panelView, panelParams); }
                    catch (Exception e) { /* detached */ }
                    return true;
                case MotionEvent.ACTION_UP:
                    return true;
            }
            return false;
        });
    }

    // ==========================================
    // Helpers
    // ==========================================

    private int getOverlayType() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                : WindowManager.LayoutParams.TYPE_PHONE;
    }

    private int dpToPx(int dp) {
        return (int) (dp * getResources().getDisplayMetrics().density);
    }

    private void safeRemoveView(View view) {
        if (view != null) {
            try { windowManager.removeView(view); } catch (Exception e) { /* ignore */ }
        }
    }
}
