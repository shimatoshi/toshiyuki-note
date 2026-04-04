package com.toshiyuki.note;

import android.util.Base64;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.util.Iterator;
import java.util.UUID;

/**
 * Manages attachment files and their manifest for notebooks.
 */
public class AttachmentManager {

    private static final String TAG = "AttachmentManager";
    private final NoteStorage storage;

    public AttachmentManager(NoteStorage storage) {
        this.storage = storage;
    }

    public String getAttachments(String notebookId, int pageNum) {
        try {
            File manifestFile = manifestFile(notebookId);
            String content = storage.readFile(manifestFile);
            if (content == null || content.isEmpty()) return "[]";
            JSONObject manifest = new JSONObject(content);
            String key = String.valueOf(pageNum);
            return manifest.has(key) ? manifest.getJSONArray(key).toString() : "[]";
        } catch (Exception e) {
            Log.e(TAG, "getAttachments error", e);
            return "[]";
        }
    }

    public String saveBinaryAttachment(String notebookId, int pageNum, String base64data,
                                       String filename, String type, String defaultExt) {
        try {
            String attId = UUID.randomUUID().toString();
            String ext = filename.contains(".") ? filename.substring(filename.lastIndexOf(".")) : defaultExt;

            byte[] data = Base64.decode(base64data, Base64.DEFAULT);
            File attFile = attFile(notebookId, attId + ext);
            attFile.getParentFile().mkdirs();
            try (FileOutputStream fos = new FileOutputStream(attFile)) {
                fos.write(data);
            }

            addToManifest(notebookId, pageNum, attId, type, filename, ext);
            return attId;
        } catch (Exception e) {
            Log.e(TAG, "saveBinaryAttachment error", e);
            return "";
        }
    }

    public String saveLocationAttachment(String notebookId, int pageNum, String jsonData) {
        try {
            String attId = UUID.randomUUID().toString();
            storage.writeFile(attFile(notebookId, attId + ".json"), jsonData);
            addToManifest(notebookId, pageNum, attId, "location", "location", ".json");
            return attId;
        } catch (Exception e) {
            Log.e(TAG, "saveLocationAttachment error", e);
            return "";
        }
    }

    public void deleteAttachment(String notebookId, String attId) {
        try {
            File attDir = new File(new File(storage.rootDir, notebookId), "attachments");
            File[] files = attDir.listFiles();
            if (files != null) {
                for (File f : files) {
                    if (f.getName().startsWith(attId)) { f.delete(); break; }
                }
            }
            removeFromManifest(notebookId, attId);
        } catch (Exception e) {
            Log.e(TAG, "deleteAttachment error", e);
        }
    }

    public String getAttachmentDataUrl(String notebookId, String attId, String ext) {
        try {
            File attFile = attFile(notebookId, attId + ext);
            if (!attFile.exists()) return "";

            if (ext.equals(".json")) {
                return storage.readFile(attFile);
            }

            byte[] data = storage.readBinaryFile(attFile);
            String base64 = Base64.encodeToString(data, Base64.NO_WRAP);
            return "data:" + NoteStorage.guessMimeType(ext) + ";base64," + base64;
        } catch (Exception e) {
            Log.e(TAG, "getAttachmentDataUrl error", e);
            return "";
        }
    }

    // --- Manifest ---

    private void addToManifest(String notebookId, int pageNum, String attId, String type, String name, String ext) throws JSONException {
        File mf = manifestFile(notebookId);
        String content = storage.readFile(mf);
        JSONObject manifest = (content != null && !content.isEmpty()) ? new JSONObject(content) : new JSONObject();

        String key = String.valueOf(pageNum);
        JSONArray pageAtts = manifest.has(key) ? manifest.getJSONArray(key) : new JSONArray();

        JSONObject att = new JSONObject();
        att.put("id", attId);
        att.put("type", type);
        att.put("name", name);
        att.put("ext", ext);
        att.put("createdAt", storage.nowISO());
        pageAtts.put(att);

        manifest.put(key, pageAtts);
        storage.writeFile(mf, manifest.toString(2));
    }

    private void removeFromManifest(String notebookId, String attId) {
        try {
            File mf = manifestFile(notebookId);
            String content = storage.readFile(mf);
            if (content == null) return;

            JSONObject manifest = new JSONObject(content);
            Iterator<String> keys = manifest.keys();
            while (keys.hasNext()) {
                String key = keys.next();
                JSONArray arr = manifest.getJSONArray(key);
                JSONArray newArr = new JSONArray();
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject att = arr.getJSONObject(i);
                    if (!attId.equals(att.optString("id"))) newArr.put(att);
                }
                manifest.put(key, newArr);
            }
            storage.writeFile(mf, manifest.toString(2));
        } catch (Exception e) {
            Log.e(TAG, "removeFromManifest error", e);
        }
    }

    private File manifestFile(String notebookId) {
        return new File(new File(storage.rootDir, notebookId), "attachments/manifest.json");
    }

    private File attFile(String notebookId, String filename) {
        return new File(new File(storage.rootDir, notebookId), "attachments/" + filename);
    }
}
