package com.toshiyuki.note;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.os.Environment;
import android.util.Log;

import java.io.File;
import java.io.FileWriter;
import java.io.PrintWriter;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * File-based debug logger + broadcast receiver for remote debugging via Termux.
 * Logs to: getExternalFilesDir/overlay_debug.log
 * Commands: am broadcast -a com.toshiyuki.note.DEBUG --es cmd [status|toggle|dump]
 */
public class DebugLogger {

    private static final String TAG = "DebugLogger";
    private static final String ACTION = "com.toshiyuki.note.DEBUG";
    private static final SimpleDateFormat TS_FORMAT =
            new SimpleDateFormat("HH:mm:ss.SSS", Locale.US);

    private File logFile;
    private BroadcastReceiver receiver;

    public interface CommandHandler {
        void onCommand(String cmd);
    }

    public void init(Context context) {
        File dir = context.getExternalFilesDir(null);
        if (dir == null) dir = context.getFilesDir();
        logFile = new File(dir, "overlay_debug.log");
    }

    public void log(String msg) {
        if (logFile == null) return;
        try (PrintWriter pw = new PrintWriter(new FileWriter(logFile, true))) {
            pw.println(TS_FORMAT.format(new Date()) + " " + msg);
        } catch (Exception e) {
            Log.e(TAG, "fileLog error: " + e.getMessage());
        }
        Log.d(TAG, msg);
    }

    public void registerReceiver(Context context, CommandHandler handler) {
        receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context ctx, Intent intent) {
                String cmd = intent.getStringExtra("cmd");
                log("Debug broadcast: cmd=" + cmd);
                handler.onCommand(cmd != null ? cmd : "");
            }
        };
        IntentFilter filter = new IntentFilter(ACTION);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            context.registerReceiver(receiver, filter);
        }
    }

    public void unregisterReceiver(Context context) {
        if (receiver != null) {
            try { context.unregisterReceiver(receiver); } catch (Exception e) { /* ignore */ }
            receiver = null;
        }
    }
}
