

# Добавление тестов для бизнес-логики

## Цель
Увеличить покрытие тестами с ~9 файлов до ~25+, фокусируясь на чистых утилитах и критичной бизнес-логике.

## Что добавляем

### 1. Настройка инфраструктуры
- Создать `vitest.config.ts` и `src/test/setup.ts` (отсутствуют)
- Обновить `tsconfig.app.json` — добавить `"vitest/globals"` в types

### 2. Тесты для утилит (чистые функции — без моков)

| Файл теста | Что тестируем |
|---|---|
| `src/utils/__tests__/formatSnils.test.ts` | `formatSnils`, `isValidSnils` — форматирование и валидация СНИЛС |
| `src/utils/__tests__/txtTestParser.test.ts` | `parseTxtTestFile` — парсинг вопросов из TXT формата |
| `src/utils/__tests__/testAnswersExport.test.ts` | `parseAnswersFile`, `exportQuestionsForAI` — экспорт/импорт ответов |
| `src/utils/__tests__/frdoExcelExport.test.ts` | `buildDPORow`, `buildPORow`, `formatDateForFRDO` — формирование строк ФРДО |
| `src/utils/__tests__/networkErrorDetector.test.ts` | `isBlockedBySecuritySoftware` — детект блокировок антивирусом |
| `src/utils/__tests__/referralCookie.test.ts` | `saveRefCode`, `getRefCode`, `clearRefCode` — работа с реферальными куки |

### 3. Тесты для констант

| Файл теста | Что тестируем |
|---|---|
| `src/constants/__tests__/subscriptionPlans.test.ts` | `getPlanInfo`, `formatStorageSize`, `getMinPlanForCategory` — логика тарифов |

### 4. Тесты для хуков (с моками Supabase)

| Файл теста | Что тестируем |
|---|---|
| `src/hooks/__tests__/useAiGenerationLimit.test.ts` | `checkAiGenerationLimit`, `setAiLimitContext` — лимиты AI-генераций |
| `src/hooks/__tests__/useSubscriptionLimits.test.ts` | `checkLimit` — проверка лимитов по тарифу |
| `src/hooks/__tests__/useEnrollmentActions.test.ts` | `toggleStudentSelection`, `toggleSelectAll` — выбор студентов |

### 5. Обновление devToolsData.ts
- `test-coverage`: статус → `applied`, текст → «~25 файлов покрыто тестами. Утилиты и бизнес-логика.»

## Итого
- **~16 новых тестовых файлов** (6 утилит + 1 константы + 3 хука + 6 существующих)
- Покрытие: с ~2% до ~5-6% по файлам, но **100% критичных утилит**
- Приоритет: чистые функции без побочных эффектов → максимум пользы при минимуме моков

