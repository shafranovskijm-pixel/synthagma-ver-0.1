

## Plan: Offline course caching — IMPLEMENTED

Реализовано офлайн-кеширование курсов для студентов через IndexedDB. При блокировке Supabase антивирусами/фаерволами курсы загружаются из локального кеша.

### Что создано
- `src/utils/courseCache.ts` — IndexedDB обёртка для кеширования курсов и дашборда (TTL 7 дней)
- `src/utils/offlineSync.ts` — очередь отложенной синхронизации прогресса
- `src/components/student/OfflineBanner.tsx` — баннер «Офлайн-режим»

### Что обновлено
- `src/hooks/useCourseLearning.ts` — кеширует курс после загрузки, fallback на кеш при ошибке
- `src/hooks/useStudentDashboard.ts` — кеширует список курсов, fallback при ошибке
- `src/pages/CourseLearning.tsx` — показывает OfflineBanner при офлайн-режиме
