package ru.sintagma.app;

import android.content.Intent;
import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/** Uses an already installed Russian offline voice; never downloads or bills an API. */
@CapacitorPlugin(name = "NativeSpeech")
public class NativeSpeechPlugin extends Plugin {
    private final Handler main = new Handler(Looper.getMainLooper());
    private final List<Runnable> waiting = new ArrayList<>();
    private TextToSpeech engine;
    private boolean ready;
    private boolean initializing;
    private boolean destroyed;
    private boolean foreground = true;
    private long speechGeneration;
    private int initializationId;
    private String unavailableReason = "no_engine";
    private PluginCall speechCall;
    private String speechPrefix;
    private String lastUtterance;

    private void ensureEngine(Runnable action) {
        if (destroyed) { unavailableReason = "unavailable"; action.run(); return; }
        if (ready) { action.run(); return; }
        waiting.add(action);
        if (initializing) return;
        try {
        if (getContext().getPackageManager().queryIntentServices(
                new Intent(TextToSpeech.Engine.INTENT_ACTION_TTS_SERVICE), 0).isEmpty()) {
            unavailableReason = "no_engine";
            finishWaiting();
            return;
        }
        initializing = true;
        final int attempt = ++initializationId;
        engine = new TextToSpeech(getContext(), status -> main.post(() -> {
            if (attempt != initializationId || destroyed) return;
            initializing = false;
            ready = status == TextToSpeech.SUCCESS;
            unavailableReason = ready ? "missing_voice" : "init_failed";
            if (ready) installProgressListener();
            else if (engine != null) { engine.shutdown(); engine = null; }
            finishWaiting();
        }));
        main.postDelayed(() -> {
            if (!initializing || attempt != initializationId) return;
            ++initializationId;
            initializing = false;
            unavailableReason = "init_failed";
            if (engine != null) { engine.shutdown(); engine = null; }
            finishWaiting();
        }, 10000);
        } catch (RuntimeException unavailable) {
            ++initializationId;
            initializing = false;
            ready = false;
            unavailableReason = "init_failed";
            if (engine != null) { engine.shutdown(); engine = null; }
            finishWaiting();
        }
    }

    private void finishWaiting() {
        List<Runnable> callbacks = new ArrayList<>(waiting);
        waiting.clear();
        for (Runnable callback : callbacks) callback.run();
    }

    private Voice russianOfflineVoice() {
        if (!ready || engine == null) return null;
        Set<Voice> voices = engine.getVoices();
        if (voices == null) return null;
        Voice best = null;
        for (Voice voice : voices) {
            if (!"ru".equals(voice.getLocale().getLanguage()) || voice.isNetworkConnectionRequired()) continue;
            if (voice.getFeatures() != null && voice.getFeatures().contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED)) continue;
            if (best == null || voice.getQuality() > best.getQuality()) best = voice;
        }
        return best;
    }

    private JSObject status() {
        Voice voice = russianOfflineVoice();
        JSObject result = new JSObject();
        result.put("available", voice != null);
        result.put("reason", voice != null ? "ready" : ready ? "missing_voice" : unavailableReason);
        if (voice != null) result.put("voiceName", voice.getName());
        return result;
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        main.post(() -> ensureEngine(() -> call.resolve(status())));
    }

    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text", "").trim();
        if (text.isEmpty() || text.length() > 200000) {
            call.reject("Не удалось озвучить текст: пустой текст или превышен размер.");
            return;
        }
        main.post(() -> {
            stopSpeech();
            final long request = speechGeneration;
            ensureEngine(() -> {
            if (request != speechGeneration || !foreground || destroyed) {
                JSObject result = new JSObject(); result.put("completed", false);
                call.resolve(result);
                return;
            }
            Voice voice = russianOfflineVoice();
            if (voice == null) {
                call.reject("Русский голос Android недоступен. Проверьте настройки озвучивания телефона.");
                return;
            }
            if (engine.setVoice(voice) != TextToSpeech.SUCCESS) {
                call.reject("Не удалось включить русский голос Android.");
                return;
            }
            speechCall = call;
            speechPrefix = UUID.randomUUID().toString() + ":";
            List<String> chunks = chunks(text);
            lastUtterance = speechPrefix + (chunks.size() - 1);
            for (int i = 0; i < chunks.size(); i++) {
                int result = engine.speak(chunks.get(i), i == 0 ? TextToSpeech.QUEUE_FLUSH : TextToSpeech.QUEUE_ADD,
                        null, speechPrefix + i);
                if (result != TextToSpeech.SUCCESS) { failSpeech(); break; }
            }
            });
        });
    }

    private List<String> chunks(String text) {
        List<String> chunks = new ArrayList<>();
        int limit = Math.max(1, TextToSpeech.getMaxSpeechInputLength() - 1);
        for (int start = 0; start < text.length();) {
            int end = Math.min(text.length(), start + limit);
            if (end < text.length()) {
                int boundary = text.lastIndexOf(' ', end);
                if (boundary > start + limit / 2) end = boundary;
                if (Character.isHighSurrogate(text.charAt(end - 1))) end--;
            }
            chunks.add(text.substring(start, end));
            start = end;
        }
        return chunks;
    }

    private void installProgressListener() {
        engine.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            public void onStart(String id) { }
            public void onDone(String id) {
                main.post(() -> {
                    if (speechCall != null && id != null && id.equals(lastUtterance)) {
                        PluginCall finished = speechCall;
                        speechCall = null;
                        JSObject result = new JSObject(); result.put("completed", true);
                        finished.resolve(result);
                    }
                });
            }
            public void onError(String id) {
                main.post(() -> { if (speechCall != null && id != null && id.startsWith(speechPrefix)) failSpeech(); });
            }
            public void onError(String id, int code) { onError(id); }
        });
    }

    private void failSpeech() {
        PluginCall failed = speechCall;
        speechCall = null;
        if (engine != null) engine.stop();
        if (failed != null) failed.reject("Android не смог озвучить текст. Проверьте установленный русский голос.");
    }

    private void stopSpeech() {
        ++speechGeneration;
        PluginCall stopped = speechCall;
        speechCall = null;
        if (engine != null) engine.stop();
        if (stopped != null) {
            JSObject result = new JSObject(); result.put("completed", false);
            stopped.resolve(result);
        }
    }

    @PluginMethod
    public void stop(PluginCall call) { main.post(() -> { stopSpeech(); call.resolve(); }); }

    @Override
    protected void handleOnPause() { main.post(() -> { foreground = false; stopSpeech(); }); }

    @Override
    protected void handleOnResume() { main.post(() -> foreground = true); }

    @Override
    protected void handleOnDestroy() {
        main.post(() -> {
            destroyed = true;
            ++initializationId;
            initializing = false;
            stopSpeech();
            if (engine != null) { engine.shutdown(); engine = null; }
            ready = false;
            unavailableReason = "unavailable";
            finishWaiting();
        });
    }
}
