package com.toshiyuki.note;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.graphics.PixelFormat;
import android.os.Build;
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

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        Log.d(TAG, "onCreate");

        createNotificationChannel();
        startForeground(NOTIFICATION_ID, buildNotification());

        // Check overlay permission
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) {
            Log.e(TAG, "No overlay permission, stopping service");
            stopSelf();
            return;
        }

        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);

        try {
            createBubble();
        } catch (Exception e) {
            Log.e(TAG, "Failed to create bubble", e);
            stopSelf();
        }
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
                    bubbleParams.x = initialX + dx;
                    bubbleParams.y = initialY + dy;
                    try {
                        windowManager.updateViewLayout(bubbleView, bubbleParams);
                    } catch (Exception e) {
                        Log.e(TAG, "updateViewLayout error", e);
                    }
                    return true;

                case MotionEvent.ACTION_UP:
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
            webView.loadUrl("file:///android_asset/public/overlay.html");

            ImageView closeBtn = panelView.findViewById(R.id.overlay_close_btn);
            closeBtn.setOnClickListener(v -> togglePanel());
        } catch (Exception e) {
            Log.e(TAG, "Failed to create panel", e);
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

                DisplayMetrics metrics = getResources().getDisplayMetrics();
                int panelHeight = metrics.heightPixels / 4;

                WindowManager.LayoutParams panelParams = new WindowManager.LayoutParams(
                        WindowManager.LayoutParams.MATCH_PARENT,
                        panelHeight,
                        getOverlayType(),
                        WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
                        PixelFormat.TRANSLUCENT
                );
                panelParams.gravity = Gravity.BOTTOM;
                panelParams.softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE;

                windowManager.addView(panelView, panelParams);
                isPanelVisible = true;
            }
        } catch (Exception e) {
            Log.e(TAG, "togglePanel error", e);
            isPanelVisible = false;
        }
    }

    @Override
    public void onDestroy() {
        Log.d(TAG, "onDestroy");
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
