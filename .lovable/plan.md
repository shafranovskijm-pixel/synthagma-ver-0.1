

## Расширенные настройки конвейера маркетплейса

### Что нужно сделать

Расширить виджет конвейера и добавить новую вкладку «Настройки» в маркетплейс с тремя блоками:

1. **Настройки промтов** — редактируемые системные промты для каждого этапа генерации (структура, контент, решение тестов), чтобы администратор мог менять поведение ИИ без изменения кода
2. **Импорт курсов из Excel** — возможность загрузить Excel-файл с названиями курсов и автоматически создать их в маркетплейсе (отличается от текущего BulkCourseImporter, который парсит тесты Ростехнадзора)
3. **Настройки доступа** — переключатель «Бесплатные курсы для организаций» и дефолтные цены

### Технический план

**1. Новый компонент `src/components/admin/MarketplaceSettings.tsx`**

Три секции в Collapsible/Accordion:

**Секция «Промты ИИ»:**
- Textarea для промта генерации структуры (дефолт из `generate-course-structure`)
- Textarea для промта генерации контента (дефолт из `gigachat` action `generate_content`)
- Textarea для промта решения тестов (дефолт из `gigachat` action `generate_answers`)
- Промты сохраняются в `localStorage` под ключом `marketplace_prompts`
- Кнопка «Сбросить к дефолту» для каждого промта

**Секция «Быстрый импорт курсов»:**
- Загрузка Excel-файла с колонкой «Название» (и опциональные «Описание», «Длительность»)
- Превью таблицы с найденными курсами
- Кнопка «Создать все» — последовательно создаёт курсы в маркетплейсе (аналогично `handleCreateCourse`)
- Прогресс-бар создания

**Секция «Настройки маркетплейса»:**
- Переключатель: «Все курсы бесплатны для организаций» → при включении `price_organization = 0` для новых курсов и массовое обновление существующих
- Дефолтная цена для студентов и организаций (используется при импорте и в конвейере)
- Сохранение в `localStorage` под ключом `marketplace_settings`

**2. Обновление `BulkPipelineWidget.tsx`**

- Принимает опциональный проп `customPrompts` с текстами промтов
- Передаёт кастомные промты в edge functions через дополнительное поле `body.customSystemPrompt`

**3. Обновление edge functions**

- `gigachat/index.ts`: если в теле запроса есть `customSystemPrompt`, использовать его вместо встроенного
- `generate-course-structure/index.ts`: аналогично — принять `customSystemPrompt` и подставить вместо хардкода

**4. Интеграция в `AdminMarketplaceManager.tsx`**

- Добавить пятую вкладку «Настройки» с иконкой Settings
- Подключить `<MarketplaceSettings />` внутри `TabsContent value="settings"`
- Прокинуть промты из localStorage в `BulkPipelineWidget`

### Файлы

| Файл | Действие |
|------|----------|
| `src/components/admin/MarketplaceSettings.tsx` | Создать |
| `src/components/admin/AdminMarketplaceManager.tsx` | Добавить вкладку «Настройки», прокинуть промты |
| `src/components/admin/BulkPipelineWidget.tsx` | Принять и использовать кастомные промты |
| `supabase/functions/gigachat/index.ts` | Поддержка `customSystemPrompt` |
| `supabase/functions/generate-course-structure/index.ts` | Поддержка `customSystemPrompt` |

