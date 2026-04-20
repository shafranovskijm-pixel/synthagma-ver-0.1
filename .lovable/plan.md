

## Что чиним и улучшаем

### 1. Баг: предпросмотр всегда показывает один и тот же шаблон

**Причина:** в `LandingTemplatePreviewDialog` корневой контейнер секций не имеет `key`, привязанного к шаблону. Когда пользователь открывает один шаблон, закрывает диалог, открывает другой — React переиспользует поддерево секций (внутри `LandingHeroSection`, `LandingPricingSection` и т.п. могут быть собственные `useState`/`useEffect` с устаревшими данными), и часть UI (фон, выбранный тариф, открытый FAQ-айтем) остаётся от прошлого шаблона.

**Фикс:**
- Передать `key={template.id}` на корневой `<div>` внутри `<ScrollArea>`, чтобы при смене шаблона всё поддерево пересоздавалось.
- Дополнительно в `LandingTemplatesGallery` сбрасывать `previewing` в `null` за один тик до открытия нового (используем `flushSync` или просто гарантируем ремаунт через `key`).
- Скроллить превью наверх при смене шаблона: `useEffect` в диалоге, реф на ScrollArea-viewport → `scrollTop = 0`.

### 2. Hover-автопрокрутка превью на карточке шаблона

При наведении мыши на превью-картинку в карточке шаблона — она плавно «прокручивается» сверху вниз, показывая весь лендинг как анимированный плакат (как на скриншоте Profit Course из референса).

**Реализация:**
- Создаём `src/assets/landing-templates/<id>-full.jpg` — полные длинные скриншоты лендинга 1280×4500 (для каждого из 3 шаблонов). Генерируем через ИИ-картинки или встроенный визуальный сборщик.
- Альтернатива (предпочтительная, без генерации тяжёлых картинок): **CSS-only mini-render** — внутри карточки рендерим уменьшенный (через `scale(0.18)`) реальный лендинг (через `LandingTemplatePreviewDialog`-секции в `pointer-events: none`). При hover контейнер с `overflow: hidden` запускает CSS-анимацию `transform: translateY(0 → -calc(100% - cardHeight))` за 6 секунд `ease-in-out`. Останавливается при `mouseleave` и плавно возвращается к началу.
- Этот же mini-render — единый источник правды и для статичной обложки (первый кадр) и для hover-прокрутки. Превью-JPG больше не нужны.

**Новый компонент:** `src/components/course-editor/LandingTemplateMiniPreview.tsx`
- Принимает `template`, `courseSnapshot` (title, orgName и т.п.).
- Рендерит уменьшенный лендинг (тот же набор секций, что в полном диалоге) внутри контейнера 1280px ширины, скейлится в карточку.
- Анимация скролла через CSS `@keyframes scrollPreview` запускается при `group-hover`.
- При первом рендере viewport фиксируется на верхней части (hero виден).

### 3. Удаление превью-JPG

`src/assets/landing-templates/aurora.jpg`, `beauty.jpg`, `safety.jpg` больше не используются — можно удалить (или оставить как фолбэк, но они больше не подгружаются).

---

## Файлы

**Новые:**
- `src/components/course-editor/LandingTemplateMiniPreview.tsx` — мини-рендер с hover-прокруткой.

**Изменения:**
- `src/components/course-editor/LandingTemplatePreviewDialog.tsx`:
  - `key={template.id}` на корневом контейнере секций;
  - сброс `scrollTop = 0` через ref при смене шаблона.
- `src/components/course-editor/LandingTemplatesGallery.tsx`:
  - заменить `<img>` на `<LandingTemplateMiniPreview>`;
  - убрать импорты PNG-превью (больше не нужны на карточках).
- `src/lib/landing-templates/types.ts`: `preview_image` сделать опциональным (или удалить — не используется).
- `src/lib/landing-templates/{aurora,beauty,safety}.ts`: удалить импорт `preview_image`.
- `src/lib/appVersion.ts` → `1.0.17`.

**Удаление:** `src/assets/landing-templates/*.jpg` (3 файла).

---

## Edge-кейсы
- На мобильных hover нет — mini-preview показывает статичный первый экран, прокрутка триггерится при тапе по превью (как сейчас, открывает полный диалог).
- При большом количестве шаблонов в сетке (5+) ленивая загрузка mini-preview через `IntersectionObserver` — рендерим только видимые карточки.
- `prefers-reduced-motion: reduce` — отключаем CSS-анимацию прокрутки.

