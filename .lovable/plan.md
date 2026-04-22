

# Аудит «Сделки 360°» → Быстрые действия + Задачи

## Что не работает сейчас

```text
┌──────────────────────────────────┬────────────────────────────────────┐
│ Кнопка / блок                    │ Статус                             │
├──────────────────────────────────┼────────────────────────────────────┤
│ Создать КП                       │ ❌ нет колбэка в SalesManager      │
│ Создать договор                  │ ❌ нет колбэка                     │
│ Выставить счёт                   │ ❌ нет колбэка                     │
│ Записать звонок                  │ ❌ обработчик не передаётся вообще │
│ Заметка                          │ ❌ обработчик не передаётся вообще │
│ Задача                           │ ❌ обработчик не передаётся вообще │
│ История общения                  │ ⚠️ читает type/notes,              │
│                                  │   а в БД — activity_type/description│
│                                  │   → всегда показывает «нет активн.»│
│ Раздел «Задачи» (SalesTasks)     │ ✅ работает (создание/выполнение)  │
│ Тайм-лайн / Карточка / Канбан    │ ✅ работают                        │
└──────────────────────────────────┴────────────────────────────────────┘
```

## План правок

### 1. `Deals360.tsx` — поднять колбэки до родителя
- Расширить `Deals360Props`: `onAddCall`, `onAddNote`, `onAddTask`.
- Прокинуть их в `DealQuickActions` рядом с уже существующими `onCreateProposal/Contract/Invoice`.

### 2. `DealQuickActions.tsx` — кнопки уже принимают `onClick`, ничего не правим

### 3. `SalesManager.tsx` (админ) — реализовать обработчики
Превратить `<Deals360 />` в полноценный контейнер:
- **Создать КП / договор / счёт** → переключение `activeTab` на `proposals` / `contracts` / `proposals` (счета у нас пока выставляются в КП-редакторе) + проброс компании через React-state (`pendingCompany`), который читается соответствующим менеджером для предзаполнения.
- **Записать звонок** → открыть лёгкий `Dialog` с формой (длительность, заметка, результат) → `INSERT` в `sales_lead_activities` (`activity_type='call'`). Если для компании ещё нет лида — создать его «на лету» в `sales_leads` с `inn`+`org_name`.
- **Заметка** → тот же диалог, но `activity_type='note'`, поле «Текст».
- **Задача** → открыть существующий диалог `NewTaskForm` из `SalesTasks` с предзаполненной компанией (передать `companyName` как заголовок-подсказку, привязать `lead_id` к найденному/созданному лиду).

Аналогично — для `OrgSalesManager.tsx` (кабинет организации). Уже передаются 3 колбэка; добавить ещё 3.

### 4. `DealCommunication.tsx` — починить чтение истории
- Заменить `select('id, type, notes, ...')` на `select('id, activity_type, description, ...')`.
- В `.forEach`: `a.activity_type` вместо `a.type`, `a.description` вместо `a.notes`.
- После добавления звонка/заметки — инвалидировать данные (через `key` или прямой re-fetch), чтобы карточка обновилась мгновенно.

### 5. Новый компонент `LogActivityDialog.tsx`
Универсальный диалог на 2 типа (`call` / `note`) с полями:
- Тип (radio): Звонок / Заметка
- Текст (textarea)
- Дата/время (по умолчанию — сейчас)
- Кнопка «Сохранить»  

Логика:
1. Поиск лида по `inn` → если нет, ищем по `org_name`.
2. Если лида нет — `INSERT` в `sales_leads` (`org_name`, `inn`, `status='new'`).
3. `INSERT` в `sales_lead_activities` (`lead_id`, `activity_type`, `description`).
4. Toast «Записано», закрытие, refetch истории общения.

### 6. Предзаполнение в КП/договорах
- В `CommercialProposals` и `SalesContracts` принять необязательный prop `prefillCompany?: { name, inn }`.
- При наличии → автоматически открывать редактор создания и подставлять название/ИНН (поиск по `sales_companies_db` по ИНН подтянет реквизиты, если есть).

## Файлы

- **Edit:** `src/components/admin/sales/Deals360.tsx` — 3 новых пропа + проброс
- **Edit:** `src/components/admin/sales/DealQuickActions.tsx` — без изменений (уже готово)
- **Edit:** `src/components/admin/SalesManager.tsx` — обёртка с состоянием pending-компании и колбэками
- **Edit:** `src/components/organization/sales/OrgSalesManager.tsx` — то же самое для организации
- **Edit:** `src/components/admin/sales/DealCommunication.tsx` — фикс полей `activity_type`/`description`
- **New:** `src/components/admin/sales/LogActivityDialog.tsx` — диалог звонок/заметка
- **Edit:** `src/components/admin/sales/CommercialProposals.tsx` — приём `prefillCompany`
- **Edit:** `src/components/admin/sales/SalesContracts.tsx` — приём `prefillCompany`
- **Edit:** `src/components/admin/sales/SalesTasks.tsx` — экспортировать форму отдельно или принимать `prefillLead/Title`

## Что станет работать после

- Все 6 кнопок в правой панели «Быстрые действия» — кликабельные и приводят к реальному результату.
- История общения покажет реальные звонки/заметки/КП.
- Сделки → задачи → активности связаны единым контекстом компании.
- Аналогично — в кабинете организации (OrgSalesManager).

