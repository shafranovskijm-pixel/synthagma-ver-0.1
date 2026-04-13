

# Исправление: обложка не отображается после генерации

## Причина

В `useCourses.ts` строка 85: `if (hasPreloadedData) return;` — когда курсы приходят из dashboard (`initialCourses`), **любой вызов `refresh()` игнорируется**, потому что `hasPreloadedData` всегда `true`. После генерации обложки `refresh()` ничего не делает — новый `cover_image_url` не загружается из БД.

## Решение

Два изменения в `src/hooks/useCourses.ts`:

1. **Разрешить fetch при явном refresh даже с preloaded data**: добавить флаг `manualRefresh` — когда `refreshKey > 0`, выполнять fetch независимо от `hasPreloadedData`.

2. **Оптимистичное обновление обложки**: в `handleGenerateCourseCover` в `CoursesTab.tsx` — после успешной генерации, сразу обновить локальное состояние через `updateCourseLocally(courseId, { cover_image_url: data.url })` вместо `refresh()`, чтобы обложка появилась мгновенно без повторного запроса к БД.

### Конкретные правки

**`src/hooks/useCourses.ts`** — строка 84-85:
```typescript
// Было:
if (hasPreloadedData) return;

// Станет:
if (hasPreloadedData && refreshKey === 0) return;
```
Это позволит `refresh()` (который увеличивает `refreshKey`) работать даже с preloaded data.

**`src/components/organization/tabs/CoursesTab.tsx`** — строка 299-300:
```typescript
// Было:
toast.success("Обложка курса сгенерирована!");
refresh();

// Станет:
toast.success("Обложка курса сгенерирована!");
if (data?.url) {
  updateCourseLocally(courseId, { cover_image_url: data.url });
}
```
Обложка появится мгновенно без запроса к БД.

## Файлы
- `src/hooks/useCourses.ts` — разрешить refresh при preloaded data
- `src/components/organization/tabs/CoursesTab.tsx` — оптимистичное обновление обложки

