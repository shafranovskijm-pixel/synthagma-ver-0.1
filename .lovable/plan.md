

# «Создать договор» — генерация готового договора + конструктор внутри дашборда

## Суть
Две задачи:

1. **«Создать договор»** (в разделе Контрагенты → Договоры) должна открывать **диалог создания готового договора**, а не конструктор шаблона. Диалог:
   - Автоматически подставляет реквизиты организации (из БД)
   - Предлагает выбрать контрагента: из существующих учеников, из компаний, или найти по ИНН (DaData)
   - Предлагает выбрать шаблон договора (из сохранённых)
   - Предлагает выбрать курс(ы) для подстановки
   - Генерирует готовый договор с подставленными данными

2. **Конструктор шаблона договора** (в Инструменты → Конструктор → Договор) должен открываться **внутри дашборда** как вкладка, а не переходить на `/contract-editor`.

## Изменения

### 1. Новый компонент `CreateContractDialog.tsx`
Диалог с шагами:
- **Шаг 1**: Выбор шаблона договора (из сохранённых в `organization_settings`)
- **Шаг 2**: Выбор контрагента — 3 варианта:
  - Из учеников (поиск по `enrollments` + `profiles`)
  - Из компаний (поиск по `company_clients`)
  - По ИНН (DaData lookup, как уже реализовано в `ExternalInvoiceForm`)
- **Шаг 3**: Выбор курса (подтягивает `course_title`, `course_hours`, `course_duration`, цену)
- **Шаг 4**: Заполнение оставшихся полей (номер договора, даты, количество, сумма)
- **Шаг 5**: Предпросмотр заполненного договора → сохранение

### 2. `DocumentsTab.tsx` — кнопка «Создать договор»
Заменить `navigate("/contract-editor")` на открытие `CreateContractDialog` во всех 3 местах (строки 661, 727, 880).

### 3. Конструктор договора внутри дашборда
- Добавить `"contract-editor"` в `TabType` (`OrgSidebar.tsx`)
- В `DocumentsTab.tsx` строка 726 («Открыть конструктор») — вместо `navigate("/contract-editor")` → `setActiveTab("contract-editor")` (через контекст `useOrgDashboard`)
- В `TabContentRenderer.tsx` — рендерить `ContractTemplateEditor` при `activeTab === "contract-editor"`
- Добавить `"contract-editor"` в список вкладок, скрывающих stats/banner

### 4. Маршрут `/contract-editor`
Оставить как редирект → `/organization?tab=contract-editor` для обратной совместимости.

## Файлы

| Файл | Действие |
|---|---|
| `src/components/organization/CreateContractDialog.tsx` | Новый — диалог генерации готового договора |
| `src/components/organization/tabs/DocumentsTab.tsx` | Кнопки «Создать договор» → открывают диалог; «Открыть конструктор» → `setActiveTab` |
| `src/components/organization/OrgSidebar.tsx` | Добавить `"contract-editor"` в `TabType` |
| `src/components/organization/tabs/TabContentRenderer.tsx` | Рендер `ContractTemplateEditor` при `contract-editor` |
| `src/pages/OrganizationDashboard.tsx` | Обработка `?tab=contract-editor` |
| `src/pages/ContractEditor.tsx` | Редирект → `/organization?tab=contract-editor` |

