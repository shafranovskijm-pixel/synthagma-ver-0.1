

# Исправление заявок на запись + баннер с прогрессом

## Проблемы

### 1. Заявки не приходят
При записи на курс (платный или бесплатный) запись в `enrollment_requests` **не создаётся** для платных курсов. В `CourseLanding.tsx` и `AvailablePaidCourses.tsx` при `price > 0` отправляется только чат-сообщение и уведомление в `org_notifications`, но **не** запись в `enrollment_requests`. Панель «Заявки» (`ChatRequestsPanel`) читает только из `enrollment_requests` — поэтому заявки не видны.

### 2. Баннер «Общий прогресс» не переключается
Баннер в `StudentLibrary.tsx` — обычный `<div>` со стилями, **не** использует `HeroBannerSwiper`. У него нет стрелок и свайпа. Нужно обернуть его в `HeroBannerSwiper`, чтобы фон переключался так же, как в организации.

## Решение

### Заявки
В **обоих** местах (`CourseLanding.tsx` и `AvailablePaidCourses.tsx`) для платных курсов добавить создание записи в `enrollment_requests` (вместе с существующим chat + notification):

```typescript
// Для платных курсов тоже создаём enrollment_request
await supabase.from("enrollment_requests").insert({
  user_id: user.id,
  course_id: course.id,
  status: "pending"
});
```

Это гарантирует, что заявка появится в панели «Заявки» организации.

### Баннер
В `StudentLibrary.tsx` заменить статичный градиентный `<div>` на `HeroBannerSwiper` с тем же содержимым (прогресс, время, уроки) в качестве `children`. Фон будет переключаться стрелками и свайпом.

## Файлы

| Действие | Файл |
|----------|------|
| Изменить | `src/pages/CourseLanding.tsx` — добавить `enrollment_requests.insert` для платных курсов |
| Изменить | `src/components/student/AvailablePaidCourses.tsx` — добавить `enrollment_requests.insert` |
| Изменить | `src/components/student/StudentLibrary.tsx` — обернуть баннер в `HeroBannerSwiper` |

