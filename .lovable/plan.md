

# Ограничение Kinescope на бесплатных тарифах

## Что делаем

На тарифах «Бесплатный», «Старт» и «Стандарт» заменяем вкладку Kinescope в загрузке видео на промо-заглушку с призывом перейти на тариф «Профессиональный». Загрузка «На сервер (до 2 ГБ)» остаётся доступной на всех тарифах.

## Изменения

### 1. `src/pages/CourseBuilder.tsx`
Пробросить `organizationId` в `SortableLessonItem` как новый проп.

### 2. `src/components/course-builder/SortableLessonItem.tsx`
- Добавить проп `organizationId?: string`
- Импортировать `useSubscriptionLimits` и `Lock` из lucide
- Определить `isKinescopeAvailable` — план `professional` или `maximum`
- Если Kinescope недоступен:
  - Вкладка Kinescope в `TabsList` отображается, но при клике переключает на заглушку
  - Вместо зоны загрузки показывать промо-блок:
    ```
    🔒 Загрузка через Kinescope
    Профессиональный видеохостинг с CDN и DRM-защитой
    доступен на тарифе «Профессиональный» и выше.
    [Перейти к тарифам →]
    ```
  - Кнопка «Перейти к тарифам» ведёт на `/organization/{orgId}?tab=tariffs` (через `useNavigate`)
  - По умолчанию активная вкладка `videoUploadTab` ставится на `"server"` если Kinescope недоступен

### 3. `src/constants/subscriptionPlans.ts`
Добавить `kinescopeEnabled: boolean` в `PlanLimits`:
- `false` для free, start, standard
- `true` для professional, maximum

Это позволит проверять доступность через `limits.kinescopeEnabled` единообразно по всему проекту.

## Файлы

| Файл | Изменение |
|------|-----------|
| `src/constants/subscriptionPlans.ts` | Новое поле `kinescopeEnabled` в лимитах |
| `src/pages/CourseBuilder.tsx` | Проброс `organizationId` в `SortableLessonItem` |
| `src/components/course-builder/SortableLessonItem.tsx` | Проверка плана + промо-заглушка вместо Kinescope |

