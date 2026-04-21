

## План: End-to-end проверка LiveKit вебинара + починка секретов

### Что вижу прямо сейчас

В логах `livekit-create-room` ошибка:
```
Invalid URL: 'LIVEKIT_URL=wss://sintagma-h5kuy8k3.livekit.cloud LIVEKIT_API_KEY=APIkR7fby7jQSyS LIVEKIT_API_SECRET=4yD7AlqtrNGsarYggVJx1XyzaUPmcCEHvEx0UwSCwkA/twirp/livekit.RoomService/CreateRoom'
```

Это значит: в секрет **`LIVEKIT_WS_URL`** в Lovable Cloud вставлена **вся строка целиком** (URL + API key + API secret через пробел), а не только URL. Мой `extractSecret()` парсит её корректно для key/secret, но для URL берёт первый `wss://...` токен **до пробела**, и в `wsUrl` остаётся хвост `wss://sintagma-h5kuy8k3.livekit.cloud` — это правильно. **НО** в реальности fallback-ветка возвращает `trimmed` (всю строку), потому что регулярка ищет `LIVEKIT_URL=` со словарной границей `(?:^|[\s;,])`, а в начале строки `LIVEKIT_URL=` стоит **без префикса** — `^LIVEKIT_URL=...` — match идёт, но возвращается весь хвост `wss://... LIVEKIT_API_KEY=...` как `\S+` до первого пробела… однако, судя по ошибке, парсер не сработал и в `fetch()` ушла вся грязная строка.

**Корень проблемы:** секреты в Lovable Cloud забиты в одно поле как `.env`-блок. Самый надёжный способ — почистить секреты, а не плодить регулярки.

### Что я делаю

**Шаг 1 — Почистить секреты LiveKit**
Через интерфейс `update_secret` перезапишу 3 секрета чистыми значениями:
- `LIVEKIT_WS_URL` = `wss://sintagma-h5kuy8k3.livekit.cloud`
- `LIVEKIT_API_KEY` = `APIkR7fby7jQSyS` (только ключ, без префикса)
- `LIVEKIT_API_SECRET` = `4yD7AlqtrNGsarYggVJx1XyzaUPmcCEHvEx0UwSCwkA` (только секрет)

После очистки `extractSecret()` сразу попадёт в первую ветку «уже чистое значение» и вернёт URL без артефактов.

**Шаг 2 — Усилить парсер на случай повторения**
Добавлю в `extractSecret` для `kind="url"` строгую финальную нормализацию: после извлечения значения откусываю всё, что идёт после первого пробела/`=`/перевода строки. Так даже если кто-то снова склеит `.env` в одно поле — функция не упадёт.

Файлы:
- `supabase/functions/livekit-create-room/index.ts`
- `supabase/functions/livekit-issue-token/index.ts`

**Шаг 3 — End-to-end тест**

1. `supabase--curl_edge_functions` → `POST /livekit-create-room` с телом `{"title":"e2e test"}` — ожидаю `200 { ok: true, roomName, wsUrl }`. Если ошибка — читаю `edge_function_logs`.
2. `supabase--curl_edge_functions` → `POST /livekit-issue-token` с реальным `webinarId` (создам тестовый webinar через `read_query` → `INSERT` миграцией или возьму существующий) — ожидаю `200 { ok: true, token, wsUrl, roomName }`.
3. JWT-токен раскодирую и проверю поля `iss`, `room`, `roomJoin`, `canPublish`.
4. Проверю валидность WebSocket-URL (`wss://...livekit.cloud`) — не пингую, просто формат.

**Шаг 4 — Проверка UI потока в админке (без браузера)**

Прочитаю код кнопки «Создать тестовый» в `AdminCreateWebinarDialog.tsx` и `AdminWebinarsOverview.tsx` — убежусь, что:
- Кнопка вызывает `livekit-create-room` → пишет `roomName` в `webinars.player_settings.livekit.roomName`.
- В `EmbeddedWebinarPlayer` для типа `livekit` берётся токен через `livekit-issue-token` и подключается к комнате.

**Шаг 5 — Отчёт**

Выдаю короткий результат:
- ✅/❌ создание комнаты
- ✅/❌ выдача токена для host
- ✅/❌ выдача токена для viewer (если есть тестовый ученик с доступом)
- список несоответствий, если найду

### Что НЕ делаю в этом проходе

- Не запускаю `browser--*` (не нужно — edge-функции тестируются через `curl_edge_functions`).
- Не меняю UI вебинаров — он уже готов с прошлой итерации.
- Версию платформы не бампаю — это диагностика, а не фича.

### Критерии готовности

1. `POST /livekit-create-room` возвращает `200` с валидным `roomName`.
2. `POST /livekit-issue-token` возвращает `200` с JWT, который декодируется и содержит правильные `room` и `video.canPublish=true` для хоста.
3. В админке кнопка «Создать тестовый» → выбор LiveKit → плеер `LiveKitRoom` подключается без 500-х.
4. В чат пишу: «работает» либо точное место поломки + что чинить дальше.

