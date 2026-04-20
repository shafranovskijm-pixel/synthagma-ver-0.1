

## Что делаем

Две связанные задачи:

### A. Шаблоны лендинга — новая первая вкладка раздела «Страница курса»
В разделе **Страница курса** появляется первая вкладка **«Шаблоны»**. В ней — каталог готовых лендингов. Нажатие на «Применить» заменяет содержимое `landing_content` курса на структуру выбранного шаблона. Сразу отдаём один полностью готовый, премиальный продающий шаблон **«Аврора»** — он будет доступен всем планам. Структура расширяемая — позже добавим Pro/Premium шаблоны через флаг `tier`.

### B. Фикс: «одностраничный» редактор без меню
Кнопка «← Все курсы» / выход из конструктора и редактора лендинга больше не выкидывает на старый отдельный экран `/course/:id/edit` (CourseEditor.tsx) без сайдбара организации. Вместо этого — возврат на интегрированный дашборд `/organization?tab=course-details&courseId=...`, где курс открыт во встроенном виде с боковым меню и шапкой организации. Старый одностраничный редактор курса (`CourseEditor.tsx`) и его маршрут больше не используются для этой роли.

---

## Архитектура

### A. Шаблоны

**Файлы:**
- `src/lib/landing-templates/types.ts` — тип `LandingTemplate { id, name, tagline, preview_image, accent_color, tier: 'free'|'pro'|'premium', data: LandingData }`.
- `src/lib/landing-templates/index.ts` — массив `LANDING_TEMPLATES` с одним шаблоном `aurora` на старте.
- `src/lib/landing-templates/aurora.ts` — данные шаблона: hero subtitle, audience (3 карточки), learn (4–6 пунктов), process, benefits (4), pricing (3 тарифа: «Стартовый», «Стандарт», «Премиум» с фичами), faq (5–6 вопросов), reviews (3 отзыва), cta. Полный текст продающий, готовый к использованию.
- `src/components/course-editor/LandingTemplatesGallery.tsx` — UI каталога: сетка карточек (превью-картинка/градиент с акцент-цветом, название, тэглайн, бейдж тарифа), кнопка «Применить шаблон» открывает `AlertDialog` с предупреждением «Текущее содержимое страницы будет заменено». При подтверждении — мерж: применяем `template.data` поверх дефолтных значений, сохраняем в `courses.landing_content` через `supabase.from('courses').update`, тостим, обновляем стейт.

**Интеграция:**
- `CoursePageSettingsContent.tsx`: добавляем новую вкладку `"templates"` **первой** в `TAB_ORDER` (`templates`, потом `page`, `seo`, …). Иконка `LayoutTemplate` из lucide. Описание: «Готовые продающие шаблоны страниц».
- В контенте вкладки рендерим `<LandingTemplatesGallery courseId={courseId} accentColor={s.accentColor} onApplied={s.handleSave} />`.
- Превью-картинки шаблонов кладём в `src/assets/landing-templates/aurora.jpg` (генерируем через ИИ как часть имплементации, либо CSS-градиент-плейсхолдер если генерация не требуется).

### B. Фикс выхода из редактора

**Сценарии «одностраничного выхода» сейчас:**
1. Старый маршрут `/course/:courseId/edit` → компонент `CourseEditor.tsx` → шапка с `← getAdminAwareBackPath()` ведёт на `/organization` (теряется выбранный курс).
2. `CourseLandingEditor.tsx` (standalone-режим, не embedded) — кнопка «← Редактор курса» ведёт на `/course/${courseId}/edit` (тот самый одностраничный экран).
3. `CoursePreview.tsx` — аналогично через `useCoursePreview.navigateBack`.

**Решение:**
- Добавить хелпер `getCourseDetailsPath(courseId)` в `src/lib/utils.ts`:
  ```ts
  export function getCourseDetailsPath(courseId: string) {
    const base = localStorage.getItem("adminViewAsOrg") ? "/admin" : "/organization";
    return `${base}?tab=course-details&courseId=${courseId}`;
  }
  ```
- `CourseEditor.tsx`: кнопка «← назад» теперь ведёт на `getCourseDetailsPath(courseId)`.
- `CourseLandingEditor.tsx` (не-embedded): кнопка «Редактор курса» → `getCourseDetailsPath(courseId)` (открывает курс во встроенном дашборде, по умолчанию открывается вкладка «Конструктор» через `activeTab: editor`).
- `CourseDetailsContent`: при `activeTab === 'editor'` уже рендерится `<CourseBuilder embedded />` — никаких изменений не требуется.
- `useCoursePreview.navigateBack`: вместо `/course-builder/${courseId}` — на `getCourseDetailsPath(courseId)`.
- В `CourseDetailsModal.tsx` — карточка «Открыть редактор» в `landing` тоже ведёт на встроенный редактор лендинга (вкладка landing уже в дашборде, ссылка не нужна — оставляем как есть для модального сценария вне дашборда).

**Маршрут `/course/:id/edit` оставляем рабочим** для прямого доступа по URL (закладки, открытие в новой вкладке), но кнопки «выход» отовсюду ведут на интегрированный дашборд. Удалять маршрут не будем, чтобы не поломать существующие ссылки.

---

## Файлы

**Новые:**
- `src/lib/landing-templates/types.ts`
- `src/lib/landing-templates/index.ts`
- `src/lib/landing-templates/aurora.ts`
- `src/components/course-editor/LandingTemplatesGallery.tsx`
- `src/assets/landing-templates/aurora.jpg` (ИИ-сгенерированная превьюшка, 16:9)

**Изменения:**
- `src/components/course-editor/CoursePageSettingsContent.tsx` — добавить вкладку `templates` первой.
- `src/lib/utils.ts` — новый `getCourseDetailsPath`.
- `src/pages/CourseEditor.tsx` — back → интегрированный дашборд.
- `src/pages/CourseLandingEditor.tsx` — back → интегрированный дашборд.
- `src/hooks/useCoursePreview.ts` — `navigateBack` → интегрированный дашборд.
- `src/lib/appVersion.ts` → `1.0.15`.

---

## Edge-кейсы
- Применение шаблона мержится по схеме `useLandingEditor.loadData` (то же поведение, что при загрузке существующего landing_content) — все поля гарантированно заполняются дефолтами при отсутствии.
- Если у курса уже есть кастомизация — диалог подтверждения чётко предупреждает о замене.
- `accent_color` курса сохраняется (не перетирается шаблоном) — шаблон только наполняет блоки.
- Превью-картинка шаблона грузится lazy, fallback на градиент с `accent_color` шаблона.
- Тарифные ограничения (free/pro/premium) пока не блокируют — на каждой карточке только бейдж. Гейтинг подключим в следующей итерации (запасной флаг уже в типе).

