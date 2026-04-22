

# Брендированный экран и шапка для гостя + статус LiveKit и записи

## Часть 1 — Гость видит «полосочку», а должно быть как у админа

**Что сейчас на скрине:** гость подключился через `/w/<token>` → `WebinarPublic.tsx` → `<VideoConference />` без брендинга, без QR/счётчика участников/чата (только верхняя полоса «1 of 2 / Покинуть»).

**Причина:** `WebinarPublic.tsx` (стр. 98–126) использует «голую» `<LiveKitRoom>` без `WelcomeOverlay` и без шапки. А весь брендинг и шапка живут в `EmbeddedWebinarPlayer.tsx` + `LiveKitTopBar` + `WelcomeOverlay`.

**Решение:** переиспользовать `EmbeddedWebinarPlayer` для гостя — но в **read-only** режиме (без кнопок «Завершить», «Доступ», «Ссылка для участников»).

### Технические изменения

1. **`EmbeddedWebinarPlayer.tsx`** — сейчас компонент сам ходит в `livekit-issue-token` через `webinarId`. Гость не имеет доступа к `webinars` напрямую — у него только `publicToken`. Добавлю два новых опциональных пропа:
   - `prefetchedToken?: string` и `prefetchedWsUrl?: string` — если переданы, компонент **пропускает** свой `fetchToken()` и сразу использует их.
   - `viewOnly?: boolean` — если `true`, в `LiveKitTopBar` скрываются кнопки «Завершить», «Доступ», «QR», «Ссылка для участников». Остаётся только: 🔴 LIVE-индикатор, название эфира, счётчик 👥, кнопка «Покинуть».

2. **`WebinarPublic.tsx`** — после успешного `join()` (получен `lkToken` + `wsUrl`) рендерить:
   ```tsx
   <EmbeddedWebinarPlayer
     webinarId={info.id}
     sourceType="livekit"
     webinarTitle={info.title}
     prefetchedToken={lkToken}
     prefetchedWsUrl={wsUrl}
     viewOnly
     onEnd={() => { setLkToken(null); setWsUrl(null); }} // = «Покинуть»
   />
   ```
   Таким образом гость получит:
   - **Брендированный «Добро пожаловать на вебинар Синтагма»** пока ведущий не включил камеру.
   - Стандартный `<VideoConference />` со встроенным **чатом** (`@livekit/components-react` рендерит чат-панель внутри `VideoConference` автоматически — у него есть кнопка «Chat» в нижнем тулбаре, видна на скрине, просто сейчас она крошечная из-за пустого видео).
   - Шапку с 🔴 LIVE / название / 👥 счётчик / «Покинуть».

3. Удалить дубль JSX «Already in live room» (стр. 98–126) из `WebinarPublic.tsx`.

## Часть 2 — Состояние LiveKit Free tier и запись

### Лимиты LiveKit Cloud (Free tier)

По данным проекта `sintagma-h5kuy8k3.livekit.cloud`:
- **1 000 AI-минут/мес** (используется AI-преподавателем; вебинары не списывают AI-минуты).
- **5 000 минут участников/мес** (1 участник × 1 минута = 1 «participant minute»).
- **до 100 одновременных участников** в одной комнате.
- **до 100 ГБ исходящего трафика/мес**.
- Запись (Egress) на Free tier — **доступна, но требует свой S3-бакет**, LiveKit Cloud не даёт встроенного хранилища.

В админ-панели сейчас **нет дашборда с реальным потреблением минут** — данные нужно смотреть в личном кабинете LiveKit Cloud (`https://cloud.livekit.io`). Если хотите, во второй итерации добавлю Edge-функцию `livekit-usage-report` через LiveKit Analytics API + виджет в `AdminWebinarsOverview` («Использовано минут в этом месяце: X из 5000»).

### Запись (как сейчас)

- **Поля в БД есть:** `webinars.recording_url`, `recording_size_bytes`.
- **Авто-записи нет** — Edge-функция `livekit-start-recording` / Egress webhook **не созданы**.
- **Ручная загрузка реализована:**
  - Компонент `WebinarRecordingUploader.tsx` (создан в прошлой итерации).
  - Кнопка 📎 «Прикрепить запись» — **только в `WebinarsManager.tsx`** (организация), в админ-панели её **ещё нет** в таблице (компонент импортирован, но кнопка в строку не добавлена).
  - Проигрывание готовой записи: `EmbeddedWebinarPlayer` (стр. 79) — если `status='ended'` и есть `recording_url` → нативный `<video controls>`.

### Что добавлю в этой итерации по записи

- **Кнопка 📎 «Прикрепить запись»** в таблицу `AdminWebinarsOverview` для строк со статусом `ended` и `source_type='livekit'`. Использует тот же `WebinarRecordingUploader`, который уже подключён в файле.

## Файлы

| Файл | Изменение |
|---|---|
| `src/components/webinars/EmbeddedWebinarPlayer.tsx` | Добавить пропы `prefetchedToken`, `prefetchedWsUrl`, `viewOnly`. В `viewOnly` режиме `LiveKitTopBar` скрывает «Завершить», «Доступ», QR, «Ссылка для участников» — остаётся только LIVE / title / 👥 / «Покинуть». |
| `src/pages/WebinarPublic.tsx` | Заменить блок «Already in live room» на `<EmbeddedWebinarPlayer viewOnly prefetchedToken=... />`. Гость получит брендированный экран и чат. |
| `src/components/admin/AdminWebinarsOverview.tsx` | В колонку «Действия» таблицы вебинаров добавить кнопку 📎 для `livekit + ended` с открытием `WebinarRecordingUploader`. |

## Чего не делаю в этой итерации

- **Авто-запись через LiveKit Egress** — требует настройки S3-бакета в LiveKit Cloud (`AWS_S3_*` секреты + создание Edge-функций `livekit-start-recording` и `livekit-egress-webhook`). Готов сделать отдельным шагом — подтвердите.
- **Виджет «использовано минут LiveKit»** в админке — отдельная задача с LiveKit Analytics API.

## Ответы на ваши вопросы

> **Сколько минут в LiveKit?**
> Free tier даёт **5 000 минут участников/мес** (вебинары) + **1 000 AI-минут/мес** (только для AI-преподавателя). Точное текущее потребление — пока только в `cloud.livekit.io` (наш дашборд использования ещё не сделан).

> **Есть ли запись и как реализована?**
> Авто-записи нет. Реализована **ручная загрузка** MP4/WEBM в Lovable Cloud Storage (`course-files/webinar-recordings/<webinarId>.mp4`) с проигрыванием через нативный `<video>` для завершённых LiveKit-эфиров. В организации кнопка 📎 уже есть, в админке добавлю в этой итерации.

