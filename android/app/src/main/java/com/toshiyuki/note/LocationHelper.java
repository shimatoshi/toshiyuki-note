package com.toshiyuki.note;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.webkit.WebView;

import androidx.core.content.ContextCompat;

/**
 * Handles native GPS location acquisition and delivers results to WebView via JS callback.
 */
public class LocationHelper {

    private static final String TAG = "LocationHelper";
    private static final long CACHE_MAX_AGE_MS = 300000; // 5 minutes
    private static final long TIMEOUT_MS = 15000;

    private final Context context;
    private final WebView webView;
    private final Handler mainHandler;

    public LocationHelper(Context context, WebView webView, Handler mainHandler) {
        this.context = context;
        this.webView = webView;
        this.mainHandler = mainHandler;
    }

    public void getLocation(String callbackName) {
        Log.d(TAG, "getLocation called");

        if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION)
                != PackageManager.PERMISSION_GRANTED) {
            invokeCallback(callbackName, "{\"error\": \"Location permission not granted\"}");
            return;
        }

        LocationManager lm = (LocationManager) context.getSystemService(Context.LOCATION_SERVICE);
        if (lm == null) {
            invokeCallback(callbackName, "{\"error\": \"LocationManager unavailable\"}");
            return;
        }

        // Try cached location first
        Location last = getCachedLocation(lm);
        if (last != null && (System.currentTimeMillis() - last.getTime()) < CACHE_MAX_AGE_MS) {
            invokeCallback(callbackName, locationJson(last));
            return;
        }

        // Request fresh location
        String provider = lm.isProviderEnabled(LocationManager.GPS_PROVIDER)
                ? LocationManager.GPS_PROVIDER : LocationManager.NETWORK_PROVIDER;

        try {
            final boolean[] responded = {false};
            final Runnable timeoutRunnable = () -> {
                if (!responded[0]) {
                    responded[0] = true;
                    invokeCallback(callbackName, "{\"error\": \"Location timeout\"}");
                }
            };

            lm.requestSingleUpdate(provider, new LocationListener() {
                @Override
                public void onLocationChanged(Location loc) {
                    if (responded[0]) return;
                    responded[0] = true;
                    mainHandler.removeCallbacks(timeoutRunnable);
                    invokeCallback(callbackName, locationJson(loc));
                }
                @Override public void onStatusChanged(String p, int s, Bundle e) {}
                @Override public void onProviderEnabled(String p) {}
                @Override public void onProviderDisabled(String p) {
                    if (responded[0]) return;
                    responded[0] = true;
                    mainHandler.removeCallbacks(timeoutRunnable);
                    invokeCallback(callbackName, "{\"error\": \"Provider disabled: " + p + "\"}");
                }
            }, Looper.getMainLooper());

            mainHandler.postDelayed(timeoutRunnable, TIMEOUT_MS);
        } catch (SecurityException e) {
            invokeCallback(callbackName, "{\"error\": \"" + e.getMessage() + "\"}");
        }
    }

    private Location getCachedLocation(LocationManager lm) {
        try {
            Location gps = lm.getLastKnownLocation(LocationManager.GPS_PROVIDER);
            if (gps != null) return gps;
            return lm.getLastKnownLocation(LocationManager.NETWORK_PROVIDER);
        } catch (SecurityException e) {
            Log.e(TAG, "getLastKnownLocation error", e);
            return null;
        }
    }

    private String locationJson(Location loc) {
        return "{\"latitude\":" + loc.getLatitude()
                + ",\"longitude\":" + loc.getLongitude()
                + ",\"accuracy\":" + loc.getAccuracy() + "}";
    }

    private void invokeCallback(String callbackName, String json) {
        mainHandler.post(() ->
                webView.evaluateJavascript(callbackName + "(" + json + ")", null));
    }
}
