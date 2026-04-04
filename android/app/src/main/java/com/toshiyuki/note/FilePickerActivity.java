package com.toshiyuki.note;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;

/**
 * Transparent Activity to handle file picker for overlay WebView.
 * Launched by OverlayService, returns result via static callback.
 */
public class FilePickerActivity extends Activity {

    private static final String TAG = "FilePickerActivity";
    private static final int PICK_FILE = 1001;

    public interface FilePickerCallback {
        void onFilePicked(Uri uri, String fileName, String mimeType);
        void onPickCancelled();
    }

    private static FilePickerCallback callback;

    public static void setCallback(FilePickerCallback cb) {
        callback = cb;
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        String accept = getIntent().getStringExtra("accept");
        if (accept == null) accept = "*/*";

        Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
        intent.setType(accept);
        intent.addCategory(Intent.CATEGORY_OPENABLE);

        try {
            startActivityForResult(Intent.createChooser(intent, "ファイル選択"), PICK_FILE);
        } catch (Exception e) {
            Log.e(TAG, "Failed to start file picker", e);
            if (callback != null) callback.onPickCancelled();
            finish();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode == PICK_FILE) {
            if (resultCode == RESULT_OK && data != null && data.getData() != null) {
                Uri uri = data.getData();
                String mimeType = getContentResolver().getType(uri);
                String fileName = uri.getLastPathSegment();

                // Try to get display name
                try (android.database.Cursor cursor = getContentResolver().query(uri, null, null, null, null)) {
                    if (cursor != null && cursor.moveToFirst()) {
                        int idx = cursor.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME);
                        if (idx >= 0) fileName = cursor.getString(idx);
                    }
                } catch (Exception e) {
                    Log.e(TAG, "Error getting filename", e);
                }

                if (callback != null) callback.onFilePicked(uri, fileName, mimeType);
            } else {
                if (callback != null) callback.onPickCancelled();
            }
            callback = null; // Prevent leak
        }
        finish();
    }
}
