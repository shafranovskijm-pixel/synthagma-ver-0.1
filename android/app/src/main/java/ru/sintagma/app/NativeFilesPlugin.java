package ru.sintagma.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.OutputStream;

/** Saves generated learning documents through Android's user-controlled picker. */
@CapacitorPlugin(name = "NativeFiles")
public class NativeFilesPlugin extends Plugin {
    private static final int MAX_BASE64_LENGTH = 28 * 1024 * 1024;
    private volatile boolean saving = false;

    @PluginMethod
    public void save(PluginCall call) {
        String data = call.getString("data");
        if (data == null || data.length() > MAX_BASE64_LENGTH) {
            call.reject("Файл превышает допустимый размер (20 МБ).");
            return;
        }
        if (saving) {
            call.reject("Завершите сохранение предыдущего файла.");
            return;
        }
        String name = call.getString("fileName", "document").replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_");
        String mimeType = call.getString("mimeType", "application/octet-stream");
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mimeType.trim().isEmpty() ? "application/octet-stream" : mimeType);
        intent.putExtra(Intent.EXTRA_TITLE, name);
        saving = true;
        File temporaryFile = null;
        try {
            byte[] bytes = Base64.decode(data, Base64.DEFAULT);
            if (bytes.length > 20 * 1024 * 1024) throw new IllegalArgumentException("Файл превышает 20 МБ");
            temporaryFile = File.createTempFile("sintagma-export-", ".tmp", getContext().getCacheDir());
            try (OutputStream output = new FileOutputStream(temporaryFile)) {
                output.write(bytes);
            }
            // Capacitor persists PluginCall options while the picker is open.
            // Large base64 data exceeds Android's Binder saved-state limit.
            // Persist only a cache filename so recreation can resume the copy.
            call.getData().remove("data");
            call.getData().put("temporaryFileName", temporaryFile.getName());
            startActivityForResult(call, intent, "documentCreated");
        } catch (Exception error) {
            saving = false;
            if (temporaryFile != null) temporaryFile.delete();
            call.reject("Не удалось открыть выбор файла.", error);
        }
    }

    @ActivityCallback
    private void documentCreated(PluginCall call, ActivityResult result) {
        if (call == null) { saving = false; return; }
        String temporaryFileName = call.getString("temporaryFileName", "");
        if (!temporaryFileName.matches("sintagma-export-[A-Za-z0-9_-]+\\.tmp")) {
            saving = false;
            call.reject("Не удалось восстановить файл. Повторите загрузку.");
            return;
        }
        File temporaryFile = new File(getContext().getCacheDir(), temporaryFileName);
        Intent resultData = result.getData();
        Uri uri = resultData == null ? null : resultData.getData();
        if (result.getResultCode() != Activity.RESULT_OK || uri == null) {
            temporaryFile.delete();
            saving = false;
            JSObject response = new JSObject();
            response.put("saved", false);
            call.resolve(response);
            return;
        }
        getBridge().execute(() -> {
            try {
                try (FileInputStream input = new FileInputStream(temporaryFile);
                     OutputStream output = getContext().getContentResolver().openOutputStream(uri)) {
                    if (output == null) throw new IllegalStateException("Недоступен выбранный файл");
                    byte[] buffer = new byte[8192];
                    int count;
                    while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
                }
                JSObject response = new JSObject();
                response.put("saved", true);
                call.resolve(response);
            } catch (Exception error) {
                call.reject("Не удалось сохранить файл. Повторите загрузку.", error);
            } finally {
                temporaryFile.delete();
                saving = false;
            }
        });
    }
}
