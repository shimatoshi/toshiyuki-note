package com.toshiyuki.note;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.PixelFormat;
import android.os.Build;
import android.os.Environment;
import android.os.IBinder;
import android.provider.Settings;
import android.util.DisplayMetrics;
import android.util.Log;
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

import java.io.File;
import java.io.FileWriter;
import java.io.PrintWriter;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public class OverlayService extends Service {

    private static final String TAG = "OverlayService";
    private static final String CHANNEL_ID = "overlay_channel";
    private static final int NOTIFICATION_ID = 1;

    private WindowManager windowManager;
    private View bubbleView;
    private View panelView;
    private WebView webView;
    private boolean isPanelVisible = false;
    private boolean bubbleAdded = false;

    private WindowManager.LayoutParams bubbleParams;
    private int initialX, initialY;
    private float initialTouchX, initialTouchY;
    private boolean isDragging = false;

    // Panel resize
    private WindowManager.LayoutParams panelParams;
    private int panelDragStartY;
    private int panelDragStartHeight;

    private BroadcastReceiver debugReceiver;

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private static File logFile;

    private void fileLog(String msg) {
        try {
            if (logFile == null) {
                // Use external files dir - accessible from Termux via ~/storage/shared/Android/data/com.toshiyuki.note/files/
                File dir = getExternalFilesDir(null);
                if (dir == null) dir = getFilesDir();
                logFile = new File(dir, "overlay_debug.log");
            }
            PrintWriter pw = new PrintWriter(new FileWriter(logFile, true));
            String ts = new SimpleDateFormat("HH:mm:ss.SSS", Locale.US).format(new Date());
            pw.println(ts + " " + msg);
            pw.flush();
            pw.close();
            Log.d(TAG, msg);
        } catch (Exception e) {
            Log.e(TAG, "fileLog error: " + e.getMessage());
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        fileLog("onCreate");

        createNotificationChannel();
        startForeground(NOTIFICATION_ID, buildNotification());

        // Check overlay permission
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) {
            fileLog("No overlay permission, stopping service");
            stopSelf();
            return;
        }

        fileLog("Overlay permission OK");
        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);

        try {
            createBubble();
            fileLog("createBubble success, bubbleView=" + bubbleView + " bubbleAdded=" + bubbleAdded);
        } catch (Exception e) {
            fileLog("Failed to create bubble: " + e.getMessage());
            stopSelf();
        }

        // Debug receiver: am broadcast -a com.toshiyuki.note.DEBUG_TOGGLE
        debugReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                String action = intent.getStringExtra("cmd");
                fileLog("Debug broadcast received: cmd=" + action);
                if ("toggle".equals(action)) {
                    togglePanel();
                } else if ("status".equals(action)) {
                    fileLog("STATUS: bubbleAdded=" + bubbleAdded
                            + " bubbleView=" + bubbleView
                            + " bubbleParent=" + (bubbleView != null ? bubbleView.getParent() : "null")
                            + " isPanelVisible=" + isPanelVisible
                            + " panelView=" + panelView);
                } else if ("dump".equals(action)) {
                    // Dump log to shared storage for Termux to read
                    try {
                        File src = new File(getFilesDir(), "overlay_debug.log");
                        File dst = new File(Environment.getExternalStoragePublicDirectory(
                                Environment.DIRECTORY_DOWNLOADS), "overlay_debug.log");
                        java.io.BufferedReader br = new java.io.BufferedReader(new java.io.FileReader(src));
                        PrintWriter pw = new PrintWriter(new FileWriter(dst));
                        String line;
                        while ((line = br.readLine()) != null) pw.println(line);
                        pw.close();
                        br.close();
                        fileLog("Log dumped to Downloads");
                    } catch (Exception e) {
                        fileLog("dump error: " + e.getMessage());
                    }
                }
            }
        };
        registerReceiver(debugReceiver, new IntentFilter("com.toshiyuki.note.DEBUG"));
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        return START_STICKY;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "としゆきノート オーバーレイ",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("フローティングメモ機能");
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    private Notification buildNotification() {
        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("としゆきノート")
                .setContentText("フローティングメモ起動中")
                .setSmallIcon(R.mipmap.ic_launcher)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setOngoing(true)
                .build();
    }

    private int getOverlayType() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                : WindowManager.LayoutParams.TYPE_PHONE;
    }

    private void createBubble() {
        bubbleView = LayoutInflater.from(this).inflate(R.layout.overlay_bubble, null);

        bubbleParams = new WindowManager.LayoutParams(
                dpToPx(48),
                dpToPx(48),
                getOverlayType(),
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
                PixelFormat.TRANSLUCENT
        );
        bubbleParams.gravity = Gravity.TOP | Gravity.START;
        bubbleParams.x = dpToPx(8);
        bubbleParams.y = dpToPx(100);

        windowManager.addView(bubbleView, bubbleParams);
        bubbleAdded = true;

        bubbleView.setOnTouchListener((v, event) -> {
            fileLog("TOUCH action=" + event.getAction() + " rawX=" + event.getRawX() + " rawY=" + event.getRawY());
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
                    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
                        isDragging = true;
                    }
                    if (bubbleAdded && bubbleView != null && bubbleView.getParent() != null) {
                        bubbleParams.x = initialX + dx;
                        bubbleParams.y = initialY + dy;
                        try {
                            windowManager.updateViewLayout(bubbleView, bubbleParams);
                        } catch (Exception e) {
                            fileLog("updateViewLayout error: " + e.getMessage());
                        }
                    }
                    return true;

                case MotionEvent.ACTION_UP:
                    fileLog("ACTION_UP isDragging=" + isDragging);
                    if (!isDragging) {
                        togglePanel();
                    }
                    return true;
            }
            return false;
        });
    }

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

            webView.setWebViewClient(new WebViewClient());
            webView.setWebChromeClient(new WebChromeClient());

            // Register JavaScript bridge for file-based storage
            webView.addJavascriptInterface(new NotesBridge(this, webView), "NotesBridge");

            settings.setAllowFileAccess(true);
            settings.setAllowContentAccess(true);

            webView.loadUrl("file:///android_asset/public/overlay.html");

            ImageView closeBtn = panelView.findViewById(R.id.overlay_close_btn);
            closeBtn.setOnClickListener(v -> togglePanel());
        } catch (Exception e) {
            fileLog("ensurePanel FAILED: " + e.getClass().getName() + ": " + e.getMessage());
            // Log full stack trace
            java.io.StringWriter sw = new java.io.StringWriter();
            e.printStackTrace(new java.io.PrintWriter(sw));
            fileLog("ensurePanel stacktrace: " + sw.toString());
            panelView = null;
            webView = null;
        }
    }

    private void togglePanel() {
        fileLog("togglePanel called, isPanelVisible=" + isPanelVisible);
        try {
            if (isPanelVisible) {
                windowManager.removeView(panelView);
                isPanelVisible = false;
                fileLog("Panel hidden");
            } else {
                ensurePanel();
                if (panelView == null) {
                    fileLog("panelView is null after ensurePanel - ABORT");
                    return;
                }

                // Remove from parent if already attached
                if (panelView.getParent() != null) {
                    fileLog("panelView already has parent, removing first");
                    windowManager.removeView(panelView);
                }

                DisplayMetrics metrics = getResources().getDisplayMetrics();
                // Default: compact size (~4 lines of text + header/footer ≈ 280dp)
                int panelHeight = Math.min(dpToPx(280), metrics.heightPixels / 2);
                fileLog("Panel height: " + panelHeight + ", screen: " + metrics.heightPixels);

                panelParams = new WindowManager.LayoutParams(
                        WindowManager.LayoutParams.MATCH_PARENT,
                        panelHeight,
                        getOverlayType(),
                        WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
                        PixelFormat.TRANSLUCENT
                );
                panelParams.gravity = Gravity.BOTTOM;

                windowManager.addView(panelView, panelParams);
                isPanelVisible = true;

                // Setup drag handle for resize
                setupPanelDragHandle();

                fileLog("Panel shown successfully");
            }
        } catch (Exception e) {
            fileLog("togglePanel EXCEPTION: " + e.getMessage());
            isPanelVisible = false;
        }
    }

    private void setupPanelDragHandle() {
        View dragHandle = panelView.findViewById(R.id.overlay_drag_handle);
        if (dragHandle == null) return;

        dragHandle.setOnTouchListener((v, event) -> {
            switch (event.getAction()) {
                case MotionEvent.ACTION_DOWN:
                    panelDragStartY = (int) event.getRawY();
                    panelDragStartHeight = panelParams.height;
                    return true;

                case MotionEvent.ACTION_MOVE:
                    int dy = panelDragStartY - (int) event.getRawY();
                    int newHeight = panelDragStartHeight + dy;

                    // Clamp between min (200dp) and max (80% of screen)
                    DisplayMetrics metrics = getResources().getDisplayMetrics();
                    int minH = dpToPx(200);
                    int maxH = (int) (metrics.heightPixels * 0.8);
                    newHeight = Math.max(minH, Math.min(maxH, newHeight));

                    panelParams.height = newHeight;
                    try {
                        windowManager.updateViewLayout(panelView, panelParams);
                    } catch (Exception e) {
                        fileLog("panel resize error: " + e.getMessage());
                    }
                    return true;

                case MotionEvent.ACTION_UP:
                    return true;
            }
            return false;
        });
    }

    @Override
    public void onDestroy() {
        fileLog("onDestroy");
        try {
            if (debugReceiver != null) unregisterReceiver(debugReceiver);
        } catch (Exception e) { /* ignore */ }
        try {
            if (isPanelVisible && panelView != null) {
                windowManager.removeView(panelView);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error removing panel", e);
        }
        try {
            if (bubbleAdded && bubbleView != null) {
                windowManager.removeView(bubbleView);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error removing bubble", e);
        }
        if (webView != null) {
            webView.destroy();
        }
        super.onDestroy();
    }

    private int dpToPx(int dp) {
        return (int) (dp * getResources().getDisplayMetrics().density);
    }
}
