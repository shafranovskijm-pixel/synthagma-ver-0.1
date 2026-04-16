

# Обновление Карты кода, API-монитора и Здоровья + План улучшения

## Текущая ситуация vs данные в devToolsData.ts

Данные в файле **устарели** — проект значительно вырос:

| Метрика | Было в данных | Реально сейчас |
|---------|--------------|----------------|
| Всего файлов | 550 | **714** |
| Строк кода | ~149K | **~177K** |
| Компоненты | 322 файлов / 93.9K строк | **405 файлов / 99.7K строк** |
| Хуки | 79 / 17.7K | **86 / 20K** |
| Страницы | 58 / 18K | **60 / 16.6K** |
| Edge-функции | 60 | **64** (+ tbank-init, tbank-init-subscription, tbank-webhook, create-demo-org, notify-enrollment-request, referral-monthly-stats, fish-audio-tts убран) |
| Utils | 31 / 3.5K | **31 / 3.6K** |
| organization/ | 118 файлов / 45.1K | **141 файлов / 45.4K** |

## Что будет сделано

### 1. Обновить `devToolsData.ts` — актуальные метрики

- **CODE_TREE**: обновить все цифры (файлы/строки) для каждой папки и подпапки
- **TOTAL_FILES / TOTAL_LINES**: 714 / ~177K
- **LARGEST_FILES**: обновить строки (CoursePreview 1248, SelfExaminationQuiz 1244, StudentsTab 1196 и т.д.), добавить новые крупные файлы (LessonEditor 726, StorageManager 724, MazeGame 699)
- **EDGE_FUNCTIONS**: добавить 7 новых (tbank-init, tbank-init-subscription, tbank-webhook, create-demo-org, notify-enrollment-request, referral-monthly-stats, fish-audio-tts), убрать robokassa-*, обновить категории
- **QUALITY_METRICS**: обновить все значения
- **KEY_DEPENDENCIES**: без изменений

### 2. Обновить рекомендации (CODE_RECOMMENDATIONS) — план улучшения

Добавить актуальный план рефакторинга с приоритетами:

**Критичные (error):**
- `CoursePreview.tsx` (1248 строк) — разбить на preview-секции
- `SelfExaminationQuiz.tsx` (1244) — логика в хук
- `AutoDocumentRegistrationJournal.tsx` (1226) — логика в хук
- `StudentsTab.tsx` (1196) — вынести таблицу и фильтры
- `OrganizationsManager.tsx` (1178) — декомпозиция

**Предупреждения (warn):**
- 18 файлов > 800 строк (было 23, оптимизировано 5)
- `organization/` — 141 файл, 45K строк, нужна группировка по доменам
- `admin/` — вырос до 85 файлов / 24K строк
- Покрытие тестами < 2%
- `parse-skillspace-course` — 1146 строк, самая крупная edge-функция

### 3. Обновить `CodeMapTab.tsx`

- Обновить `contextComponents` список (актуализировать мигрированные)
- Context Coverage пересчитать

### 4. Обновить `ApiMonitorTab.tsx`

- Новые функции автоматически подтянутся из обновлённого `EDGE_FUNCTIONS`

### 5. Обновить `HealthTab.tsx`

- Новые рекомендации автоматически подтянутся из `CODE_RECOMMENDATIONS`

## Файлы

| Файл | Изменения |
|------|-----------|
| `src/components/admin/devtools/devToolsData.ts` | Полное обновление всех метрик, добавление новых edge-функций и рекомендаций |
| `src/components/admin/devtools/CodeMapTab.tsx` | Обновить contextComponents |

