
# Актуализация SEO настроек

## Проблемы

1. **Устаревшая цена на главной странице** — в `SEOSettingsManager` description указано "От 8 000 руб./мес.", в `Index.tsx` — "От 0 руб.". Актуальная минимальная цена: бесплатный тариф (0 руб.), платные от 3 490 руб./мес.
2. **Title главной > 60 символов** — "СИНТАГМА — Система дистанционного обучения и документооборота" = 61 символ, SEO-менеджер показывает красным
3. **Устаревшие даты в sitemap.xml** — все `lastmod` указывают на `2025-01-31`, нужно обновить на текущую дату
4. **Отсутствуют публичные страницы в sitemap** — нет `/roadmap`, `/install`, `/feature/*` страниц (7 страниц)
5. **Отсутствуют страницы в SEO-менеджере** — `/roadmap`, `/install`, `/login`, `/feature/*` не настраиваются
6. **Нет Helmet на страницах About, Blog, Features, Install** — эти страницы не используют `react-helmet-async`, поисковики видят только базовый title из `index.html`

## Что будет сделано

### 1. Обновить `SEOSettingsManager` — расширить список страниц

Добавить недостающие публичные страницы в `DEFAULT_PAGES`:
- `/login` — Вход в систему
- `/roadmap` — Дорожная карта
- `/install` — Установка приложения
- `/feature/frdo` — ФРДО
- `/feature/documents` — Документооборот
- `/feature/video-id` — Видеоидентификация
- `/feature/labor-safety` — Охрана труда
- `/feature/course-store` — Магазин курсов
- `/feature/document-checklist` — Чек-лист документов
- `/feature/course-settings` — Настройки курсов

Исправить title главной до 60 символов: "СИНТАГМА — СДО и документооборот для организаций"

Исправить description: "От 0 руб." (бесплатный тариф существует)

### 2. Обновить `sitemap.xml`

- Обновить все `lastmod` на `2026-02-13`
- Добавить все публичные страницы: `/roadmap`, `/feature/frdo`, `/feature/documents`, `/feature/video-id`, `/feature/labor-safety`, `/feature/course-store`, `/feature/document-checklist`, `/feature/course-settings`

### 3. Обновить мета-теги на `Index.tsx`

- Укоротить title до 60 символов
- Синхронизировать description с SEO-менеджером

### 4. Добавить Helmet на страницы без мета-тегов

Добавить `react-helmet-async` на:
- `About.tsx`
- `Blog.tsx`  
- `Features.tsx`
- `Install.tsx`

(RoadmapPage уже имеет Helmet)

## Технические детали

### Затронутые файлы

| Файл | Изменение |
|---|---|
| `src/components/admin/SEOSettingsManager.tsx` | Расширить DEFAULT_PAGES, исправить title/description |
| `public/sitemap.xml` | Обновить даты, добавить страницы |
| `src/pages/Index.tsx` | Укоротить title, синхронизировать description |
| `src/pages/About.tsx` | Добавить Helmet с мета-тегами |
| `src/pages/Blog.tsx` | Добавить Helmet с мета-тегами |
| `src/pages/Features.tsx` | Добавить Helmet с мета-тегами |
| `src/pages/Install.tsx` | Добавить Helmet с мета-тегами |
