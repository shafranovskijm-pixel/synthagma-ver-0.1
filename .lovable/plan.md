

# Kinescope API: найдена причина ошибки 405 + полный аудит возможностей

## КРИТИЧЕСКАЯ НАХОДКА: Неправильный эндпоинт загрузки

Причина ошибки `405 method not allowed` — **мы используем неправильный API для загрузки видео**.

Наш код в `kinescope-proxy` делает:
```
POST https://api.kinescope.io/v1/videos   ← ЭТО НЕ ЗАГРУЗКА, этот эндпоинт НЕ существует для создания видео!
```

По документации Kinescope, загрузка видео идет через **Uploader API**:
```
POST https://uploader.kinescope.io/v2/init   ← Способ 1: получить ссылку для загрузки
POST https://uploader.kinescope.io/v2/video  ← Способ 2: загрузка одним запросом или по URL
```

Это не проблема токена — это проблема неправильного эндпоинта. Токен работает нормально.

---

## Что нужно исправить

### 1. `upload_init` — переписать на правильный Uploader API

Вместо `POST /v1/videos` → использовать `POST https://uploader.kinescope.io/v2/init`:

```text
POST https://uploader.kinescope.io/v2/init
Authorization: Bearer ${token}
Content-Type: application/json

{
  "type": "video",
  "parent_id": "...",
  "title": "...",
  "filesize": 12345678
}

→ Ответ: { data: { id: "video_id", endpoint: "https://...upload-url..." } }
```

Фронтенд затем загружает файл напрямую по `endpoint` через TUS или обычный POST.

### 2. `kinescope-migrate-videos` — исправить загрузку по URL

Вместо `POST /v1/videos` с `{ url: "..." }` → использовать `POST https://uploader.kinescope.io/v2/video` с заголовками:

```text
POST https://uploader.kinescope.io/v2/video
Authorization: Bearer ${token}
X-Parent-ID: ${parent_id}
X-Video-Title: ${title}
X-Video-URL: ${source_url}
```

---

## Аудит: что мы используем vs. что доступно

| Возможность | Статус | Комментарий |
|---|---|---|
| Загрузка видео (TUS) | ❌ Сломано | Неправильный эндпоинт — нужно исправить |
| Загрузка по URL (миграция) | ❌ Сломано | Тот же неправильный эндпоинт |
| Список проектов/видео | ✅ Работает | `GET /v1/projects`, `GET /v1/videos` |
| Удаление видео | ✅ Работает | `DELETE /v1/videos/{id}` |
| DRM авторизационный бэкенд | ✅ Реализовано | `kinescope-drm-auth` edge function |
| Трансляции (Live) | ✅ Реализовано | create/stop/get/list live |
| Вебхуки | ❌ Не реализовано | Можно получать уведомления о готовности видео |
| IFrame Player API (JS SDK) | ❌ Не используем | Сейчас просто iframe; можно отслеживать прогресс, события |
| Аналитика API | ❌ Не используем | Статистика просмотров |
| Постеры видео | ❌ Не используем | `https://kinescope.io/{id}/poster.jpg` |

---

## Рекомендуемый план (по приоритету)

### Фаза 1 — Исправить загрузку (критическое)

| Файл | Изменение |
|---|---|
| `supabase/functions/kinescope-proxy/index.ts` | `upload_init`: заменить `POST /v1/videos` на `POST uploader.kinescope.io/v2/init` |
| `supabase/functions/kinescope-migrate-videos/index.ts` | Заменить `POST /v1/videos` с URL на `POST uploader.kinescope.io/v2/video` с заголовком `X-Video-URL` |

### Фаза 2 — Вебхуки (полезно)

Создать edge function `kinescope-webhook` для получения уведомлений `media.update.status`. Когда видео обработано (`status: "done"`), обновлять статус в БД. Пользователь будет видеть, готово ли видео к просмотру.

### Фаза 3 — IFrame Player API (улучшение LMS)

Интегрировать JS SDK Kinescope в `VideoPlayerInline` для:
- Отслеживания реального прогресса просмотра (не просто «открыл урок»)
- Автоперехода к следующему уроку при завершении видео
- Сохранения позиции просмотра (resume)

### Фаза 4 — Постеры и аналитика (приятно)

- Показывать превью видео (`poster.jpg`) в списке уроков
- Подключить аналитику Kinescope (статистика просмотров по видео)

---

**Рекомендую начать с Фазы 1 — это починит загрузку видео.** Подтвердите, и я исправлю оба файла.

