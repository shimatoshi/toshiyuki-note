package com.toshiyuki.note;

import android.content.Context;
import android.content.Intent;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

/**
 * Thin JavaScriptInterface bridge for overlay WebView.
 * Delegates to NoteStorage, AttachmentManager, and LocationHelper.
 */
public class NotesBridge {

    private static final String TAG = "NotesBridge";

    private final Context context;
    private final WebView webView;
    private final Handler mainHandler;
    private final NoteStorage storage;
    private final AttachmentManager attachments;
    private final LocationHelper location;

    public NotesBridge(Context context, WebView webView) {
        this.context = context;
        this.webView = webView;
        this.mainHandler = new Handler(Looper.getMainLooper());
        this.storage = new NoteStorage();
        this.attachments = new AttachmentManager(storage);
        this.location = new LocationHelper(context, webView, mainHandler);
    }

    // --- Notebook CRUD ---

    @JavascriptInterface
    public String listNotebooks() { return storage.listNotebooks(); }

    @JavascriptInterface
    public String getNotebookMeta(String id) { return storage.getNotebookMeta(id); }

    @JavascriptInterface
    public String createNotebook(String title) { return storage.createNotebook(title); }

    @JavascriptInterface
    public void deleteNotebook(String id) { storage.deleteNotebook(id); }

    @JavascriptInterface
    public void updateNotebookMeta(String id, String jsonMeta) { storage.updateNotebookMeta(id, jsonMeta); }

    // --- Pages ---

    @JavascriptInterface
    public String getPage(String notebookId, int pageNum) { return storage.getPage(notebookId, pageNum); }

    @JavascriptInterface
    public void savePage(String notebookId, int pageNum, String content) { storage.savePage(notebookId, pageNum, content); }

    // --- Search ---

    @JavascriptInterface
    public String search(String query) { return storage.search(query); }

    // --- Attachments ---

    @JavascriptInterface
    public String getAttachments(String notebookId, int pageNum) { return attachments.getAttachments(notebookId, pageNum); }

    @JavascriptInterface
    public String saveImageAttachment(String notebookId, int pageNum, String base64data, String filename) {
        return attachments.saveBinaryAttachment(notebookId, pageNum, base64data, filename, "image", ".jpg");
    }

    @JavascriptInterface
    public String saveFileAttachment(String notebookId, int pageNum, String base64data, String filename, String mimeType) {
        return attachments.saveBinaryAttachment(notebookId, pageNum, base64data, filename, "file", ".dat");
    }

    @JavascriptInterface
    public String saveLocationAttachment(String notebookId, int pageNum, String jsonData) {
        return attachments.saveLocationAttachment(notebookId, pageNum, jsonData);
    }

    @JavascriptInterface
    public void deleteAttachment(String notebookId, String attId) { attachments.deleteAttachment(notebookId, attId); }

    @JavascriptInterface
    public String getAttachmentDataUrl(String notebookId, String attId, String ext) {
        return attachments.getAttachmentDataUrl(notebookId, attId, ext);
    }

    // --- File Picker ---

    @JavascriptInterface
    public void pickFile(String accept, String callbackName) {
        Log.d(TAG, "pickFile called, accept=" + accept);

        FilePickerActivity.setCallback(new FilePickerActivity.FilePickerCallback() {
            @Override
            public void onFilePicked(android.net.Uri uri, String fileName, String mimeType) {
                try (java.io.InputStream is = context.getContentResolver().openInputStream(uri)) {
                    java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
                    byte[] buf = new byte[8192];
                    int n;
                    while ((n = is.read(buf)) > 0) bos.write(buf, 0, n);

                    String base64 = Base64.encodeToString(bos.toByteArray(), Base64.NO_WRAP);
                    String escapedName = fileName != null ? fileName.replace("'", "\\'") : "file";
                    String escapedMime = mimeType != null ? mimeType : "application/octet-stream";

                    mainHandler.post(() ->
                            webView.evaluateJavascript(callbackName + "({\"base64\":\"" + base64
                                    + "\",\"name\":\"" + escapedName
                                    + "\",\"mimeType\":\"" + escapedMime + "\"})", null));
                } catch (Exception e) {
                    Log.e(TAG, "pickFile read error", e);
                    mainHandler.post(() ->
                            webView.evaluateJavascript(callbackName + "({\"error\":\"" + e.getMessage() + "\"})", null));
                }
            }

            @Override
            public void onPickCancelled() {
                mainHandler.post(() ->
                        webView.evaluateJavascript(callbackName + "({\"cancelled\":true})", null));
            }
        });

        Intent intent = new Intent(context, FilePickerActivity.class);
        intent.putExtra("accept", accept);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(intent);
    }

    // --- Location ---

    @JavascriptInterface
    public void getLocation(String callbackName) { location.getLocation(callbackName); }
}
