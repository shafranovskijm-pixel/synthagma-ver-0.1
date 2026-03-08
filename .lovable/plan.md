

## План: Исправить фоллбэк на GigaChat при 402 от Lovable AI

### Проблема

В `callAI()` есть три режима:
1. `preferredProvider === "lovable_ai"` — вызывает **только** Lovable AI, **без фоллбэка**
2. `preferredProvider === "gigachat"` — вызывает GigaChat, фоллбэк на Lovable AI
3. По умолчанию — Lovable AI первый, фоллбэк на GigaChat

Для `generate_answers` код устанавливает `effectiveProvider = ai_provider || "lovable_ai"` (строка 72 gigachat/index.ts). Это значит, что при отсутствии явного `ai_provider` запрос уходит ТОЛЬКО в Lovable AI и при 402 — сразу ошибка, GigaChat даже не пробуется.

### Решение

В `gigachat-client.ts`, в блоке `preferredProvider === "lovable_ai"` (строка 604) добавить try/catch с фоллбэком на GigaChat — аналогично тому, как это сделано в default-блоке (строки 625-634).

То же самое для `callAIWithTools` (строка 647+) — там аналогичная проблема, если `preferredProvider === "gigachat"` и GigaChat падает, фоллбэк есть, но для `lovable_ai` нет.

### Изменения

Один файл: `supabase/functions/_shared/gigachat-client.ts`

```text
// Было (строка 604-607):
if (preferredProvider === "lovable_ai") {
    const text = await callLovableAI(messages, maxTokens, lModel);
    return { text, model: lModel };
}

// Станет:
if (preferredProvider === "lovable_ai") {
    try {
        const text = await callLovableAI(messages, maxTokens, lModel);
        return { text, model: lModel };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn("[callAI] Lovable AI (preferred) failed, falling back to GigaChat:", msg);
        const text = await callGigaChat(messages, gcModel, maxTokens);
        return { text, model: gcModel };
    }
}
```

После деплоя — при 402 от Lovable AI запросы будут автоматически уходить в GigaChat-Max.

