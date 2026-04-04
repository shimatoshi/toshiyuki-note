package com.toshiyuki.note;

import android.os.Environment;
import android.util.Log;

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
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * File-based note storage engine.
 * Layout: /sdcard/ToshiyukiNote/{uuid}/meta.json, pages/001.txt, attachments/
 */
public class NoteStorage {

    private static final String TAG = "NoteStorage";
    static final String ROOT_DIR = "ToshiyukiNote";
    static final int DEFAULT_PAGES = 100;
    private static final SimpleDateFormat ISO_FORMAT =
            new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);

    final File rootDir;

    public NoteStorage() {
        this.rootDir = new File(Environment.getExternalStorageDirectory(), ROOT_DIR);
        ensureRootDir();
    }

    private void ensureRootDir() {
        if (!rootDir.exists()) rootDir.mkdirs();
        File indexFile = new File(rootDir, "index.json");
        if (!indexFile.exists()) writeFile(indexFile, "[]");
    }

    // --- Notebook CRUD ---

    public String listNotebooks() {
        try {
            String content = readFile(new File(rootDir, "index.json"));
            if (content == null || content.isEmpty()) return "[]";
            JSONArray arr = new JSONArray(content);
            List<JSONObject> list = new ArrayList<>();
            for (int i = 0; i < arr.length(); i++) list.add(arr.getJSONObject(i));
            Collections.sort(list, (a, b) ->
                    b.optString("lastModified", "").compareTo(a.optString("lastModified", "")));
            JSONArray sorted = new JSONArray();
            for (JSONObject obj : list) sorted.put(obj);
            return sorted.toString();
        } catch (Exception e) {
            Log.e(TAG, "listNotebooks error", e);
            return "[]";
        }
    }

    public String getNotebookMeta(String id) {
        try {
            String content = readFile(new File(new File(rootDir, id), "meta.json"));
            return content != null ? content : "{}";
        } catch (Exception e) {
            Log.e(TAG, "getNotebookMeta error", e);
            return "{}";
        }
    }

    public String createNotebook(String title) {
        try {
            String id = UUID.randomUUID().toString();
            String now = nowISO();

            File nbDir = new File(rootDir, id);
            nbDir.mkdirs();
            new File(nbDir, "pages").mkdirs();
            new File(nbDir, "attachments").mkdirs();

            JSONObject meta = new JSONObject();
            meta.put("id", id);
            meta.put("title", title);
            meta.put("createdAt", now);
            meta.put("lastModified", now);
            meta.put("currentPage", 1);
            meta.put("totalPages", DEFAULT_PAGES);
            meta.put("showLines", false);
            writeFile(new File(nbDir, "meta.json"), meta.toString(2));
            writeFile(new File(nbDir, "attachments/manifest.json"), "{}");
            updateIndex(id, title, now);

            return id;
        } catch (Exception e) {
            Log.e(TAG, "createNotebook error", e);
            return "";
        }
    }

    public void deleteNotebook(String id) {
        try {
            deleteRecursive(new File(rootDir, id));
            removeFromIndex(id);
        } catch (Exception e) {
            Log.e(TAG, "deleteNotebook error", e);
        }
    }

    public void updateNotebookMeta(String id, String jsonMeta) {
        try {
            File metaFile = new File(new File(rootDir, id), "meta.json");
            JSONObject newMeta = new JSONObject(jsonMeta);
            newMeta.put("id", id);
            String now = nowISO();
            newMeta.put("lastModified", now);
            writeFile(metaFile, newMeta.toString(2));
            updateIndex(id, newMeta.optString("title", ""), now);
        } catch (Exception e) {
            Log.e(TAG, "updateNotebookMeta error", e);
        }
    }

    // --- Page I/O ---

    public String getPage(String notebookId, int pageNum) {
        try {
            String content = readFile(pageFile(notebookId, pageNum));
            return content != null ? content : "";
        } catch (Exception e) {
            Log.e(TAG, "getPage error", e);
            return "";
        }
    }

    public void savePage(String notebookId, int pageNum, String content) {
        try {
            File pf = pageFile(notebookId, pageNum);
            pf.getParentFile().mkdirs();
            writeFile(pf, content);

            File metaFile = new File(new File(rootDir, notebookId), "meta.json");
            String metaStr = readFile(metaFile);
            if (metaStr != null) {
                JSONObject meta = new JSONObject(metaStr);
                String now = nowISO();
                meta.put("lastModified", now);
                writeFile(metaFile, meta.toString(2));
                updateIndex(notebookId, meta.optString("title", ""), now);
            }
        } catch (Exception e) {
            Log.e(TAG, "savePage error", e);
        }
    }

    // --- Search ---

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
                    String lowerContent = content.toLowerCase(Locale.getDefault());
                    int idx = lowerContent.indexOf(lowerQuery);
                    if (idx >= 0) {
                        int start = Math.max(0, idx - 20);
                        int end = Math.min(content.length(), idx + query.length() + 20);
                        String snippet = (start > 0 ? "..." : "") + content.substring(start, end)
                                + (end < content.length() ? "..." : "");
                        String fname = pf.getName().replace(".txt", "");

                        JSONObject result = new JSONObject();
                        result.put("notebookId", nbId);
                        result.put("notebookTitle", title);
                        result.put("pageNumber", Integer.parseInt(fname));
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

    // --- Index management ---

    private void updateIndex(String id, String title, String lastModified) throws JSONException {
        File indexFile = new File(rootDir, "index.json");
        String content = readFile(indexFile);
        JSONArray arr = (content != null && !content.isEmpty()) ? new JSONArray(content) : new JSONArray();

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
            File metaFile = new File(new File(rootDir, id), "meta.json");
            String metaStr = readFile(metaFile);
            if (metaStr != null) {
                entry.put("createdAt", new JSONObject(metaStr).optString("createdAt", lastModified));
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
                if (!id.equals(obj.optString("id"))) newArr.put(obj);
            }
            writeFile(indexFile, newArr.toString(2));
        } catch (Exception e) {
            Log.e(TAG, "removeFromIndex error", e);
        }
    }

    // --- File I/O helpers (package-visible for AttachmentManager) ---

    File pageFile(String notebookId, int pageNum) {
        return new File(new File(rootDir, notebookId),
                "pages/" + String.format(Locale.US, "%03d", pageNum) + ".txt");
    }

    String readFile(File file) {
        if (!file.exists()) return null;
        try (BufferedReader br = new BufferedReader(new FileReader(file))) {
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = br.readLine()) != null) {
                if (sb.length() > 0) sb.append('\n');
                sb.append(line);
            }
            return sb.toString();
        } catch (IOException e) {
            Log.e(TAG, "readFile error: " + file.getAbsolutePath(), e);
            return null;
        }
    }

    void writeFile(File file, String content) {
        try {
            file.getParentFile().mkdirs();
            try (FileWriter fw = new FileWriter(file)) {
                fw.write(content);
            }
        } catch (IOException e) {
            Log.e(TAG, "writeFile error: " + file.getAbsolutePath(), e);
        }
    }

    byte[] readBinaryFile(File file) throws IOException {
        try (FileInputStream fis = new FileInputStream(file)) {
            byte[] data = new byte[(int) file.length()];
            int offset = 0;
            while (offset < data.length) {
                int read = fis.read(data, offset, data.length - offset);
                if (read < 0) break;
                offset += read;
            }
            return data;
        }
    }

    void deleteRecursive(File file) {
        if (file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) {
                for (File child : children) deleteRecursive(child);
            }
        }
        file.delete();
    }

    synchronized String nowISO() {
        return ISO_FORMAT.format(new Date());
    }

    static String guessMimeType(String ext) {
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
