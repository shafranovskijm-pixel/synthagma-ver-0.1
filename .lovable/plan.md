

# Продолжение декомпозиции: BlockEditorMain + OrganizationDetailsView + devToolsData

## 1. BlockEditorMain.tsx (1461 → ~300 строк)

### Новые файлы в `src/components/course-builder/block-editor/blocks/`:

**`TextBlocks.tsx`** (~210 строк) — ParagraphBlock, QuoteBlock, CalloutBlock, HighlightBlock, AccordionBlock (строки 152–355). Все используют общий паттерн AI-генерации + RichTextEditor.

**`QuizBlock.tsx`** (~75 строк) — QuizBlock (строки 357–431).

**`MediaBlocks.tsx`** (~370 строк) — ImageBlock, VideoBlock, AudioBlock, DocumentBlock, DirectVideoBlock (строки 54–808). Самый большой подкомпонент из-за логики загрузки/embed.

**`SliderBlock.tsx`** (~160 строк) — SliderBlock с парсером PPTX (строки 810–967).

**`BlockContent.tsx`** (~50 строк) — диспетчер BlockContent (строки 969–1014). Импортирует все блоки выше и маршрутизирует по `block.type`.

**`AddBlockButton.tsx`** (~60 строк) — BlockCategoryGrid + AddBlockButton + AIGenerateButton (строки 85–150).

**`SortableBlockItem.tsx`** (~280 строк) — SortableBlockItem с toolbar, стилями, пресетами, TTS, ссылками (строки 1016–1306).

### Изменённый `BlockEditorMain.tsx` (~155 строк)
Остаётся только `export function BlockEditor` (строки 1308–1461): хуки истории, undo/redo, DnD контекст, formatWithAI. Импортирует SortableBlockItem и AddBlockButton.

## 2. OrganizationDetailsView.tsx (1790 → ~500 строк)

### Новые файлы:

**`src/hooks/useOrgDetailsView.ts`** (~300 строк) — все useState, fetchStudents, fetchCourses, fetchDocuments, fetchUsage, fetchCredentials, saveSettings, handleSaveTariff, handleSaveCustomLimits и т.д. Возвращает объект со всеми стейтами и хендлерами.

**`src/components/admin/org-details/OrgSettingsPanel.tsx`** (~300 строк) — содержимое вкладки «Настройки»: тариф, кастомные лимиты, брендинг, учётные данные, настройки организации, кнопка сохранения (строки ~1400–1737).

**`src/components/admin/org-details/OrgCoursesPanel.tsx`** (~200 строк) — вкладка «Курсы»: таблица курсов, кнопки импорта, миграция блоков.

**`src/components/admin/org-details/OrgStudentsPanel.tsx`** (~150 строк) — вкладка «Ученики»: поиск, таблица студентов.

**`src/components/admin/org-details/OrgStatsPanel.tsx`** (~100 строк) — вкладка «Статистика»: графики usage, history.

### Изменённый `OrganizationDetailsView.tsx` (~500 строк)
Остаётся: интерфейсы, оркестратор с навигацией по вкладкам, header с бейджами тарифа, диалоги импорта. Использует `useOrgDetailsView()` + подкомпоненты через activeTab.

## 3. devToolsData.ts — обновление метрик

После декомпозиции:
- Крупнейший файл: ~500 (OrganizationDetailsView)
- Файлов >800: пересчитать (уменьшится на ~3-4)
- Критичные рекомендации по BlockEditorMain и OrganizationDetailsView → статус `applied`

## Файлы (создание/изменение)

| Действие | Файл |
|----------|------|
| Создать | `src/components/course-builder/block-editor/blocks/TextBlocks.tsx` |
| Создать | `src/components/course-builder/block-editor/blocks/QuizBlock.tsx` |
| Создать | `src/components/course-builder/block-editor/blocks/MediaBlocks.tsx` |
| Создать | `src/components/course-builder/block-editor/blocks/SliderBlock.tsx` |
| Создать | `src/components/course-builder/block-editor/blocks/BlockContent.tsx` |
| Создать | `src/components/course-builder/block-editor/blocks/AddBlockButton.tsx` |
| Создать | `src/components/course-builder/block-editor/blocks/SortableBlockItem.tsx` |
| Изменить | `src/components/course-builder/block-editor/BlockEditorMain.tsx` |
| Создать | `src/hooks/useOrgDetailsView.ts` |
| Создать | `src/components/admin/org-details/OrgSettingsPanel.tsx` |
| Создать | `src/components/admin/org-details/OrgCoursesPanel.tsx` |
| Создать | `src/components/admin/org-details/OrgStudentsPanel.tsx` |
| Создать | `src/components/admin/org-details/OrgStatsPanel.tsx` |
| Изменить | `src/components/admin/OrganizationDetailsView.tsx` |
| Изменить | `src/components/admin/devtools/devToolsData.ts` |

~15 файлов. Все существующие импорты продолжат работать — внешний API BlockEditor не меняется, OrganizationDetailsView остаётся экспортом из того же пути.

