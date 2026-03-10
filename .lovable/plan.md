

## Расширение safeInvoke на все AI-запросы и критические Edge-функции

### Текущее состояние

Утилиты `networkErrorDetector.ts` и `safeInvoke.ts` уже созданы и работают. Однако они интегрированы только в **3 файла**:
- `useCourseBuilder.ts`
- `TestQuestionEditor.tsx`
- `useElevenLabsTTS.ts`

Остаётся **55 файлов** с прямыми вызовами `supabase.functions.invoke`, из которых ~15-20 — критические AI- и пользовательские функции.

### План: Интеграция safeInvoke в оставшиеся файлы

Заменим `supabase.functions.invoke` → `safeInvoke` в файлах, сгруппированных по приоритету:

**Группа 1 — AI-генерация (критично)**
- `src/components/admin/ai-settings/AIComparisonPanel.tsx` — A/B тестирование моделей (вызов `gigachat`)
- `src/components/admin/ai-settings/AITestSandbox.tsx` — песочница тестов AI (вызовы `gigachat`, `generate-image`, `elevenlabs-tts`)
- `src/components/admin/BlogManager.tsx` — генерация блог-постов (`generate-blog-post`)
- `src/components/organization/ContractTemplateEditor.tsx` — обработка шаблонов ИИ (`process-contract-template`)
- `src/hooks/useCourseLearning.ts` — студенческий чат с ИИ (`student-chat`), оценка тестов (`grade-test`)
- `src/components/marketplace/CourseMarketplaceTab.tsx` и подобные — AI-описания для маркетплейса
- `src/hooks/useAutomationPipeline.ts` / `src/hooks/useBulkPipeline*.ts` — конвейер автоматизации AI

**Группа 2 — Регистрация и управление пользователями**
- `src/hooks/useStudentManagement.ts` — регистрация студентов (`register-student`, `update-student-credentials`)
- `src/hooks/useStudentDetailCard.ts` — обновление учётных данных
- `src/hooks/useSalesManager.ts` — создание менеджеров
- `src/pages/RegisterOrganization.tsx` — регистрация организации (`dadata-company`, `send-telegram-notification`)
- `src/components/organization/LaborSafetyStudentDetailCard.tsx` — управление профилями ОТ

**Группа 3 — Прочие Edge-функции**
- `src/components/organization/StorageManager.tsx` — внешнее хранилище (`get-external-storage-config`)
- `src/components/organization/SubscriptionTab.tsx` — уведомления (`send-telegram-notification`)
- `src/components/organization/OrgRequisitesForm.tsx` — поиск по ИНН (`dadata-company`)
- `src/hooks/useCourseActions.ts` — приглашения на курс (`send-course-invitation`)
- `src/pages/CourseImport.tsx` — импорт курса
- И остальные файлы с вызовами Edge-функций

### Технические детали

- Каждая замена: добавить `import { safeInvoke } from "@/utils/safeInvoke"`, заменить `supabase.functions.invoke(...)` → `safeInvoke<any>(...)` 
- Для `fetch()` вызовов (TTS, прямые запросы) — заменить на `safeFetch`
- Убрать лишний `import { supabase }` только если больше нигде в файле не используется (в большинстве случаев `supabase` останется для `.from()` запросов)
- Изменения чисто механические: сигнатура `safeInvoke` совпадает с `supabase.functions.invoke`

### Объём работы

~20 файлов, ~50 замен вызовов. Никаких изменений в логике — только замена транспорта для retry и детекции блокировок.

