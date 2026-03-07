

# Исправление Round-Robin: убрать блокировку 402 и фикс deadlock

## Проблема
По логам видно: task #0 уходит на GigaChat slot-0, получает 402 и **сразу падает** — не пробуя slot-1 и Gemini. Причина: строка 566 в `callAIRoundRobin` делает `throw err` при 402, хотя 402 на одном слоте GigaChat не означает что другой слот или Gemini недоступны.

## Что исправим

### 1. Убрать `throw` на 402 в `callAIRoundRobin` (строка 566)
Сейчас: `if (msg.includes("402")) throw err;`
Надо: убрать эту строку — пусть при 402 пробуется следующий канал (slot-1, потом Gemini). Выбрасывать 402 только если **все** каналы вернули 402.

### 2. Добавить счётчик 402 ошибок
Если все каналы вернули именно 402 — тогда бросить ошибку 402. Если хотя бы один канал упал по другой причине — бросить generic ошибку.

### 3. Таймаут в `useSlot`
Добавить таймаут ожидания слота (30с) чтобы задачи не застревали навечно, ожидая занятый слот. При таймауте — fallback на следующий канал.

## Файл
`supabase/functions/_shared/gigachat-client.ts` — строки 550-571

## Итоговая логика
```text
callAIRoundRobin:
  channel = rrCounter % 3
  for each channel (starting from assigned):
    try call → return result
    catch 402 → count402++, try next channel  ← ИСПРАВЛЕНИЕ
    catch other → try next channel
  
  if count402 == totalChannels → throw 402
  else → throw "all channels exhausted"
```

