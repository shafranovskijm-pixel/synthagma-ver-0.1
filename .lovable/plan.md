

# Обновление devToolsData.ts — актуальная статистика проекта

## Реальные цифры проекта (собрано сканированием)

| Раздел | Файлов | Строк |
|--------|--------|-------|
| src/components/admin/ | 69 | 24 421 |
| src/components/organization/ | 118 | 45 107 |
| src/components/student/ | 20 | 4 699 |
| src/components/landing/ | 14 | 3 405 |
| src/components/course-builder/ | 20 | 6 321 |
| src/components/course-editor/ | 5 | 1 806 |
| src/components/course-learning/ | 4 | 883 |
| src/components/course-landing/ | 14 | 1 595 |
| src/components/onboarding/ | 4 | 489 |
| src/components/ui/ | 46 | 3 768 |
| src/components/company/ | 7 | 1 380 |
| src/components/shared/ | 1 | 23 |
| **src/hooks/** | 70+ (вкл. course-learning/) | 16 721 |
| **src/pages/** | 58 | 17 866 |
| **src/utils/** | 31 | 3 556 |
| **supabase/functions/** | 59 | 15 661 |
| **БД таблиц** | 118 | — |
| **Всего** | ~562 файлов | ~148K строк |

## Что обновляем в `devToolsData.ts`

### 1. CODE_TREE — актуальные числа
- Все subfolders с реальными files/lines (добавить company/, course-landing/, shared/)
- totalFiles и totalLines пересчитать
- Добавить новые папки (company, course-landing, shared)

### 2. LARGEST_FILES — топ-20 реальных файлов >800 строк
28 файлов >800 строк — это показывает, что нужен рефакторинг. Обновить список с актуальными путями, строками, статусами:
- `OrganizationDetailsView.tsx` — 1969 строк (needs-work)
- `CoursesTab.tsx` — 1747 (needs-work)
- `BlockEditorMain.tsx` — 1461 (needs-work)
- `AdminAnalytics.tsx` — 1435 (needs-work)
- И т.д. — все файлы >800

### 3. QUALITY_METRICS — реальные метрики
- Средний размер файла: ~263 строк (148K / 562)
- Крупнейший файл: 1969 строк (was 800)
- Покрытие тестами: 10 файлов
- Кастомные хуки: 70+
- Edge-функции: 59
- Файлов >800 строк: 28 (новая метрика)

### 4. EDGE_FUNCTIONS — актуальный список 59 функций
Добавить новые: batch-skillspace-import, bulk-pipeline, check-secrets-status, check-subscription-expiry, convert-lesson-content, create-company-user, create-sales-manager, generate-achievements, generate-cover, generate-image, generate-seo, gigachat, handle-email-action, kinescope-*, manage-secret, migrate-course-media, notify-program-order, parse-skillspace-course, referral-commission, reimport-skillspace-batch, review-course, robokassa-*, salutespeech-tts, seed-welcome-course

### 5. CODE_RECOMMENDATIONS — актуальные рекомендации
- Добавить предупреждения о 28 файлах >800 строк (needs-work)
- Пометить OrganizationDetailsView (1969), CoursesTab (1747) как критичные
- Обновить статусы выполненных оптимизаций

## Файлы
- `src/components/admin/devtools/devToolsData.ts` — полная перезапись данных

