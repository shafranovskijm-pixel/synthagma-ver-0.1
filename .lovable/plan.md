

# План глобального улучшения кода

## Обзор
283 файла, ~51K строк. Основные проблемы: N+1 запросы, 230 `as any`, монолитный BulkPipelineWidget (1050 строк), отсутствие retry на критических путях. План разбит на 9 задач.

---

## 1. Устранить N+1 в `fetchCourseStudents` (`src/api/courses.ts`)

Строки 316-321: внутри цикла по каждому enrollment вызывается `get_decrypted_student_password` — это N+1. Нужно:
- Получить `organization_id` из первого профиля
- Вызвать `get_decrypted_student_passwords` один раз батчем
- Построить `passwordMap` и использовать его в цикле

**Было:** N вызовов RPC  
**Станет:** 1 вызов RPC

---

## 2. Декомпозиция `BulkPipelineWidget.tsx` (1050 → ~300 + 2 хука)

Извлечь:
- **`src/hooks/useBulkPipeline.ts`** — `processCourse`, `handleStart`, `handleStop`, `handleTestRun`, состояние конвейера (`isRunning`, `currentIndex`, `completedLog`, `summary`, `stopRef`)
- **`src/hooks/usePipelineExcelImport.ts`** — `handleExcelFile`, `handleCreateAll`, `parsedCourses`, `isImporting`
- **`BulkPipelineWidget.tsx`** остаётся чистым UI: рендерит карточки, collapsible-секции, использует два хука

---

## 3. Добавить `withSupabaseRetry` в `useOrganizationDataLoader.ts`

Обернуть 5 ключевых запросов в Group 1 и Group 2 в `withSupabaseRetry`:
- `courses`, `profiles`, `categories`, `companies`, `decryptedPasswords` (Group 1)
- `roles`, `identityDocs`, `frdoData` (Group 2)

Это предотвратит пустые экраны при кратковременных сбоях сети.

---

## 4. Заменить хардкод UUID маркетплейса

Найдено 5+ мест с `"00000000-0000-0000-0000-000000000000"`. Константа уже создана в `src/constants/marketplace.ts`. Нужно заменить все оставшиеся хардкоды на `MARKETPLACE_ORG_ID` в:
- `useAdminMarketplace.ts`
- `AdminMarketplaceManager.tsx`
- `useCourseStoreManager.ts`
- Любые другие файлы

---

## 5. Добавить `AbortController` в `useOrganizationDataLoader`

Текущий `cancelled` флаг не прерывает сетевые запросы. Добавить `AbortController` и передавать `signal` в запросы Supabase через `.abortSignal(controller.signal)` где поддерживается, а также проверять `cancelled` перед каждым `setState`.

---

## 6. Типизация: создать интерфейсы для таблиц, отсутствующих в types.ts

Создать `src/types/marketplace.ts` с интерфейсами:
```typescript
interface MarketplaceCourse { id: string; course_id: string; organization_id: string; price_student: number; price_organization: number; is_active: boolean; is_validated: boolean; }
interface MarketplaceOrder { id: string; marketplace_course_id: string; buyer_user_id: string | null; ... }
```

Это позволит убрать ~30 `as any` в маркетплейс-коде.

---

## 7. Оптимизация `loadTestStats` в BulkPipelineWidget

Текущая реализация делает N батчей по 200 courseIds последовательно. Можно:
- Параллелизировать батчи через `Promise.all` (по 3 параллельных)
- Объединить подсчёт в один SQL-запрос через RPC

---

## 8. Мемоизация в `useOrganizationDashboard`

Хук создаёт ~20 объектов на каждый рендер. Обернуть `useMemo` основные вычисляемые значения:
- `handleBulkSendCredentials`, `handleBulkCreateCredentials` — уже `useCallback`-like, но определены как обычные функции
- Destructured объект `dataLoader` пересоздаётся — деструктуризовать внутри `useMemo`

---

## 9. Очистка `currentPhase` из зависимостей `handleStart`

Строка 616: `handleStart` зависит от `currentPhase`, что вызывает пересоздание callback'а при каждом изменении фазы. Использовать `useRef` для `currentPhase` вместо state, читая из ref при логировании ошибок.

---

## Порядок реализации

| # | Задача | Файлы | Строк изменений |
|---|--------|-------|-----------------|
| 1 | N+1 fix в courses API | `src/api/courses.ts` | ~30 |
| 2 | Декомпозиция BulkPipeline | 3 новых/изм. файла | ~1050 рефакторинг |
| 3 | withRetry в dataLoader | `useOrganizationDataLoader.ts` | ~20 |
| 4 | Константа маркетплейса | 3-5 файлов | ~10 |
| 5 | AbortController | `useOrganizationDataLoader.ts` | ~15 |
| 6 | Типы маркетплейса | новый файл + 5 хуков | ~50 |
| 7 | Параллельные батчи stats | `BulkPipelineWidget` / хук | ~20 |
| 8 | Мемоизация dashboard | `useOrganizationDashboard.ts` | ~15 |
| 9 | currentPhase ref | `BulkPipelineWidget` / хук | ~10 |

