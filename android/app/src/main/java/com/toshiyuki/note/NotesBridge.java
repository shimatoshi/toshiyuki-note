package com.toshiyuki.note;

import android.content.Context;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.FileReader;
import java.io.FileWriter;
import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Date;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * JavaScriptInterface for overlay WebView.
 * Provides file-based note storage accessible from both overlay and Termux.
 *
 * Storage layout:
 * /sdcard/ToshiyukiNote/
 * ├── index.json
 * ├── {uuid}/
 * │   ├── meta.json
 * │   ├── pages/
 * │   │   ├── 001.txt ... 100.txt
 * │   └── attachments/
 * │       ├── manifest.json
 * │       ├── {uuid}.jpg|.dat|.json
 */
public class NotesBridge {

    private static final String TAG = "NotesBridge";
    private static final String ROOT_DIR = "ToshiyukiNote";
    private static final int DEFAULT_PAGES = 100;

    private final Context context;
    private final WebView webView;
    private final File rootDir;
    private final Handler mainHandler;

    public NotesBridge(Context context, WebView webView) {
        this.context = context;
        this.webView = webView;
        this.mainHandler = new Handler(Looper.getMainLooper());

        // Use public Downloads parent → /sdcard/ToshiyukiNote/
        File sdcard = Environment.getExternalStorageDirectory();
        this.rootDir = new File(sdcard, ROOT_DIR);
        ensureRootDir();
    }

    private void ensureRootDir() {
        if (!rootDir.exists()) {
            rootDir.mkdirs();
        }
        File indexFile = new File(rootDir, "index.json");
        if (!indexFile.exists()) {
            writeFile(indexFile, "[]");
        }
    }

    // ==========================================
    // Notebook CRUD
    // ==========================================

    @JavascriptInterface
    public String listNotebooks() {
        try {
            File indexFile = new File(rootDir, "index.json");
            String content = readFile(indexFile);
            if (content == null || content.isEmpty()) return "[]";
            // Sort by lastModified desc
            JSONArray arr = new JSONArray(content);
            List<JSONObject> list = new ArrayList<>();
            for (int i = 0; i < arr.length(); i++) {
                list.add(arr.getJSONObject(i));
            }
            Collections.sort(list, (a, b) -> {
                String ta = a.optString("lastModified", "");
                String tb = b.optString("lastModified", "");
                return tb.compareTo(ta);
            });
            JSONArray sorted = new JSONArray();
            for (JSONObject obj : list) sorted.put(obj);
            return sorted.toString();
        } catch (Exception e) {
            Log.e(TAG, "listNotebooks error", e);
            return "[]";
        }
    }

    @JavascriptInterface
    public String getNotebookMeta(String id) {
        try {
            File metaFile = new File(new File(rootDir, id), "meta.json");
            String content = readFile(metaFile);
            return content != null ? content : "{}";
        } catch (Exception e) {
            Log.e(TAG, "getNotebookMeta error", e);
            return "{}";
        }
    }

    @JavascriptInterface
    public String createNotebook(String title) {
        try {
            String id = UUID.randomUUID().toString();
            String now = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).format(new Date());

            File nbDir = new File(rootDir, id);
            nbDir.mkdirs();
            new File(nbDir, "pages").mkdirs();
            new File(nbDir, "attachments").mkdirs();

            // Create empty pages
            for (int i = 1; i <= DEFAULT_PAGES; i++) {
                writeFile(new File(nbDir, "pages/" + String.format(Locale.US, "%03d", i) + ".txt"), "");
            }

            // meta.json
            JSONObject meta = new JSONObject();
            meta.put("id", id);
            meta.put("title", title);
            meta.put("createdAt", now);
            meta.put("lastModified", now);
            meta.put("currentPage", 1);
            meta.put("totalPages", DEFAULT_PAGES);
            meta.put("showLines", false);
            writeFile(new File(nbDir, "meta.json"), meta.toString(2));

            // Empty attachment manifest
            writeFile(new File(nbDir, "attachments/manifest.json"), "{}");

            // Update index
            updateIndex(id, title, now);

            return id;
        } catch (Exception e) {
            Log.e(TAG, "createNotebook error", e);
            return "";
        }
    }

    @JavascriptInterface
    public void deleteNotebook(String id) {
        try {
            // Remove directory
            File nbDir = new File(rootDir, id);
            deleteRecursive(nbDir);

            // Update index
            removeFromIndex(id);
        } catch (Exception e) {
            Log.e(TAG, "deleteNotebook error", e);
        }
    }

    @JavascriptInterface
    public void updateNotebookMeta(String id, String jsonMeta) {
        try {
            File metaFile = new File(new File(rootDir, id), "meta.json");
            JSONObject newMeta = new JSONObject(jsonMeta);
            // Ensure id is preserved
            newMeta.put("id", id);
            String now = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).format(new Date());
            newMeta.put("lastModified", now);
            writeFile(metaFile, newMeta.toString(2));

            // Update index
            updateIndex(id, newMeta.optString("title", ""), now);
        } catch (Exception e) {
            Log.e(TAG, "updateNotebookMeta error", e);
        }
    }

    // ==========================================
    // Page read/write
    // ==========================================

    @JavascriptInterface
    public String getPage(String notebookId, int pageNum) {
        try {
            File pageFile = pageFile(notebookId, pageNum);
            String content = readFile(pageFile);
            return content != null ? content : "";
        } catch (Exception e) {
            Log.e(TAG, "getPage error", e);
            return "";
        }
    }

    @JavascriptInterface
    public void savePage(String notebookId, int pageNum, String content) {
        try {
            File pageFile = pageFile(notebookId, pageNum);
            pageFile.getParentFile().mkdirs();
            writeFile(pageFile, content);

            // Update lastModified in meta
            File metaFile = new File(new File(rootDir, notebookId), "meta.json");
            String metaStr = readFile(metaFile);
            if (metaStr != null) {
                JSONObject meta = new JSONObject(metaStr);
                String now = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).format(new Date());
                meta.put("lastModified", now);
                writeFile(metaFile, meta.toString(2));
                updateIndex(notebookId, meta.optString("title", ""), now);
            }
        } catch (Exception e) {
            Log.e(TAG, "savePage error", e);
        }
    }

    // ==========================================
    // Search
    // ==========================================

    @JavascriptInterface
    public String search(String query) {
        try {
            if (query == null || query.trim().isEmpty()) return "[]";
            String lowerQuery = query.toLowerCase(Locale.getDefault());
            JSONArray results = new JSONArray();

            JSONArray notebooks = new JSONArray(readFile(new File(rootDir, "index.json")));
            for (int i = 0; i < notebooks.length(); i++) {
                JSONObject nb = notebooks.getJSONObject(i);
                String nbId = nb.getString("id");
                String title = nb.optString("title", "");

                File pagesDir = new File(new File(rootDir, nbId), "pages");
                if (!pagesDir.exists()) continue;

                File[] pageFiles = pagesDir.listFiles();
                if (pageFiles == null) continue;

                for (File pf : pageFiles) {
                    String content = readFile(pf);
                    if (content == null || content.isEmpty()) continue;
                    if (content.toLowerCase(Locale.getDefault()).contains(lowerQuery)) {
                        // Extract snippet
                        int idx = content.toLowerCase(Locale.getDefault()).indexOf(lowerQuery);
                        int start = Math.max(0, idx - 20);
                        int end = Math.min(content.length(), idx + query.length() + 20);
                        String snippet = content.substring(start, end);

                        // Parse page number from filename (001.txt → 1)
                        String fname = pf.getName().replace(".txt", "");
                        int pageNum = Integer.parseInt(fname);

                        JSONObject result = new JSONObject();
                        result.put("notebookId", nbId);
                        result.put("notebookTitle", title);
                        result.put("pageNumber", pageNum);
                        result.put("snippet", snippet);
                        results.put(result);
                    }
                }
            }
            return results.toString();
        } catch (Exception e) {
            Log.e(TAG, "search error", e);
            return "[]";
        }
    }

    // ==========================================
    // Attachments
    // ==========================================

    @JavascriptInterface
    public String getAttachments(String notebookId, int pageNum) {
        try {
            File manifestFile = new File(new File(rootDir, notebookId), "attachments/manifest.json");
            String content = readFile(manifestFile);
            if (content == null || content.isEmpty()) return "[]";

            JSONObject manifest = new JSONObject(content);
            String key = String.valueOf(pageNum);
            if (!manifest.has(key)) return "[]";

            return manifest.getJSONArray(key).toString();
        } catch (Exception e) {
            Log.e(TAG, "getAttachments error", e);
            return "[]";
        }
    }

    @JavascriptInterface
    public String saveImageAttachment(String notebookId, int pageNum, String base64data, String filename) {
        try {
            String attId = UUID.randomUUID().toString();
            String ext = filename.contains(".") ? filename.substring(filename.lastIndexOf(".")) : ".jpg";

            // Save binary file
            byte[] data = Base64.decode(base64data, Base64.DEFAULT);
            File attFile = new File(new File(rootDir, notebookId), "attachments/" + attId + ext);
            FileOutputStream fos = new FileOutputStream(attFile);
            fos.write(data);
            fos.close();

            // Update manifest
            addToManifest(notebookId, pageNum, attId, "image", filename, ext);

            return attId;
        } catch (Exception e) {
            Log.e(TAG, "saveImageAttachment error", e);
            return "";
        }
    }

    @JavascriptInterface
    public String saveFileAttachment(String notebookId, int pageNum, String base64data, String filename, String mimeType) {
        try {
            String attId = UUID.randomUUID().toString();
            String ext = filename.contains(".") ? filename.substring(filename.lastIndexOf(".")) : ".dat";

            byte[] data = Base64.decode(base64data, Base64.DEFAULT);
            File attFile = new File(new File(rootDir, notebookId), "attachments/" + attId + ext);
            FileOutputStream fos = new FileOutputStream(attFile);
            fos.write(data);
            fos.close();

            addToManifest(notebookId, pageNum, attId, "file", filename, ext);

            return attId;
        } catch (Exception e) {
            Log.e(TAG, "saveFileAttachment error", e);
            return "";
        }
    }

    @JavascriptInterface
    public String saveLocationAttachment(String notebookId, int pageNum, String jsonData) {
        try {
            String attId = UUID.randomUUID().toString();

            // Save location JSON
            File attFile = new File(new File(rootDir, notebookId), "attachments/" + attId + ".json");
            writeFile(attFile, jsonData);

            addToManifest(notebookId, pageNum, attId, "location", "location", ".json");

            return attId;
        } catch (Exception e) {
            Log.e(TAG, "saveLocationAttachment error", e);
            return "";
        }
    }

    @JavascriptInterface
    public void deleteAttachment(String notebookId, String attId) {
        try {
            File attDir = new File(new File(rootDir, notebookId), "attachments");

            // Find and delete the file
            File[] files = attDir.listFiles();
            if (files != null) {
                for (File f : files) {
                    if (f.getName().startsWith(attId)) {
                        f.delete();
                        break;
                    }
                }
            }

            // Remove from manifest
            removeFromManifest(notebookId, attId);
        } catch (Exception e) {
            Log.e(TAG, "deleteAttachment error", e);
        }
    }

    @JavascriptInterface
    public String getAttachmentDataUrl(String notebookId, String attId, String ext) {
        try {
            File attFile = new File(new File(rootDir, notebookId), "attachments/" + attId + ext);
            if (!attFile.exists()) return "";

            if (ext.equals(".json")) {
                return readFile(attFile);
            }

            // Read binary and convert to data URL
            byte[] data = readBinaryFile(attFile);
            String base64 = Base64.encodeToString(data, Base64.NO_WRAP);
            String mimeType = guessMimeType(ext);
            return "data:" + mimeType + ";base64," + base64;
        } catch (Exception e) {
            Log.e(TAG, "getAttachmentDataUrl error", e);
            return "";
        }
    }

    // ==========================================
    // Location (async callback)
    // ==========================================

    @JavascriptInterface
    public void getLocation(String callbackName) {
        // Will be enhanced in Phase 3 with FusedLocationProvider
        // For now, use a simple approach
        mainHandler.post(() -> {
            String js = callbackName + "({\"error\": \"Location not yet implemented in NotesBridge\"})";
            webView.evaluateJavascript(js, null);
        });
    }

    // ==========================================
    // Utility: index management
    // ==========================================

    private void updateIndex(String id, String title, String lastModified) throws JSONException {
        File indexFile = new File(rootDir, "index.json");
        String content = readFile(indexFile);
        JSONArray arr = (content != null && !content.isEmpty()) ? new JSONArray(content) : new JSONArray();

        // Find and update or add
        boolean found = false;
        for (int i = 0; i < arr.length(); i++) {
            JSONObject obj = arr.getJSONObject(i);
            if (id.equals(obj.optString("id"))) {
                obj.put("title", title);
                obj.put("lastModified", lastModified);
                found = true;
                break;
            }
        }
        if (!found) {
            JSONObject entry = new JSONObject();
            entry.put("id", id);
            entry.put("title", title);
            entry.put("lastModified", lastModified);

            // Also read createdAt from meta
            File metaFile = new File(new File(rootDir, id), "meta.json");
            String metaStr = readFile(metaFile);
            if (metaStr != null) {
                JSONObject meta = new JSONObject(metaStr);
                entry.put("createdAt", meta.optString("createdAt", lastModified));
            }
            arr.put(entry);
        }

        writeFile(indexFile, arr.toString(2));
    }

    private void removeFromIndex(String id) {
        try {
            File indexFile = new File(rootDir, "index.json");
            String content = readFile(indexFile);
            JSONArray arr = (content != null) ? new JSONArray(content) : new JSONArray();
            JSONArray newArr = new JSONArray();
            for (int i = 0; i < arr.length(); i++) {
                JSONObject obj = arr.getJSONObject(i);
                if (!id.equals(obj.optString("id"))) {
                    newArr.put(obj);
                }
            }
            writeFile(indexFile, newArr.toString(2));
        } catch (Exception e) {
            Log.e(TAG, "removeFromIndex error", e);
        }
    }

    // ==========================================
    // Utility: attachment manifest
    // ==========================================

    private void addToManifest(String notebookId, int pageNum, String attId, String type, String name, String ext) throws JSONException {
        File manifestFile = new File(new File(rootDir, notebookId), "attachments/manifest.json");
        String content = readFile(manifestFile);
        JSONObject manifest = (content != null && !content.isEmpty()) ? new JSONObject(content) : new JSONObject();

        String key = String.valueOf(pageNum);
        JSONArray pageAtts = manifest.has(key) ? manifest.getJSONArray(key) : new JSONArray();

        JSONObject att = new JSONObject();
        att.put("id", attId);
        att.put("type", type);
        att.put("name", name);
        att.put("ext", ext);
        att.put("createdAt", new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).format(new Date()));
        pageAtts.put(att);

        manifest.put(key, pageAtts);
        writeFile(manifestFile, manifest.toString(2));
    }

    private void removeFromManifest(String notebookId, String attId) {
        try {
            File manifestFile = new File(new File(rootDir, notebookId), "attachments/manifest.json");
            String content = readFile(manifestFile);
            if (content == null) return;

            JSONObject manifest = new JSONObject(content);
            Iterator<String> keys = manifest.keys();
            while (keys.hasNext()) {
                String key = keys.next();
                JSONArray arr = manifest.getJSONArray(key);
                JSONArray newArr = new JSONArray();
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject att = arr.getJSONObject(i);
                    if (!attId.equals(att.optString("id"))) {
                        newArr.put(att);
                    }
                }
                manifest.put(key, newArr);
            }
            writeFile(manifestFile, manifest.toString(2));
        } catch (Exception e) {
            Log.e(TAG, "removeFromManifest error", e);
        }
    }

    // ==========================================
    // File I/O helpers
    // ==========================================

    private File pageFile(String notebookId, int pageNum) {
        return new File(new File(rootDir, notebookId), "pages/" + String.format(Locale.US, "%03d", pageNum) + ".txt");
    }

    private String readFile(File file) {
        if (!file.exists()) return null;
        try {
            StringBuilder sb = new StringBuilder();
            BufferedReader br = new BufferedReader(new FileReader(file));
            String line;
            while ((line = br.readLine()) != null) {
                if (sb.length() > 0) sb.append('\n');
                sb.append(line);
            }
            br.close();
            return sb.toString();
        } catch (IOException e) {
            Log.e(TAG, "readFile error: " + file.getAbsolutePath(), e);
            return null;
        }
    }

    private void writeFile(File file, String content) {
        try {
            file.getParentFile().mkdirs();
            FileWriter fw = new FileWriter(file);
            fw.write(content);
            fw.close();
        } catch (IOException e) {
            Log.e(TAG, "writeFile error: " + file.getAbsolutePath(), e);
        }
    }

    private byte[] readBinaryFile(File file) throws IOException {
        FileInputStream fis = new FileInputStream(file);
        byte[] data = new byte[(int) file.length()];
        fis.read(data);
        fis.close();
        return data;
    }

    private void deleteRecursive(File file) {
        if (file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) {
                for (File child : children) deleteRecursive(child);
            }
        }
        file.delete();
    }

    private String guessMimeType(String ext) {
        switch (ext.toLowerCase(Locale.US)) {
            case ".jpg": case ".jpeg": return "image/jpeg";
            case ".png": return "image/png";
            case ".gif": return "image/gif";
            case ".webp": return "image/webp";
            case ".pdf": return "application/pdf";
            case ".txt": return "text/plain";
            default: return "application/octet-stream";
        }
    }
}
