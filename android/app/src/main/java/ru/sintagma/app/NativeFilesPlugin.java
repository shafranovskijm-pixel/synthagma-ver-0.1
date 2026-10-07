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
import java.io.OutputStream;

/** Saves generated learning documents through Android's user-controlled picker. */
@CapacitorPlugin(name = "NativeFiles")
public class NativeFilesPlugin extends Plugin {
    private static final int MAX_BASE64_LENGTH = 28 * 1024 * 1024;
    private boolean saving = false;

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
        try {
            startActivityForResult(call, intent, "documentCreated");
        } catch (Exception error) {
            saving = false;
            call.reject("Не удалось открыть выбор файла.", error);
        }
    }

    @ActivityCallback
    private void documentCreated(PluginCall call, ActivityResult result) {
        saving = false;
        if (call == null) return;
        Intent resultData = result.getData();
        Uri uri = resultData == null ? null : resultData.getData();
        if (result.getResultCode() != Activity.RESULT_OK || uri == null) {
            JSObject response = new JSObject();
            response.put("saved", false);
            call.resolve(response);
            return;
        }
        getBridge().execute(() -> {
            try (OutputStream output = getContext().getContentResolver().openOutputStream(uri)) {
                if (output == null) throw new IllegalStateException("Недоступен выбранный файл");
                byte[] bytes = Base64.decode(call.getString("data", ""), Base64.DEFAULT);
                output.write(bytes);
                JSObject response = new JSObject();
                response.put("saved", true);
                call.resolve(response);
            } catch (Exception error) {
                call.reject("Не удалось сохранить файл. Повторите загрузку.", error);
            }
        });
    }
}
