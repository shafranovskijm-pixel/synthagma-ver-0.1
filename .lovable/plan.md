## Цель

Переработать рабочий экран менеджера продаж («Компании» на `/sales`) под операционный B2B-инструмент: убрать декоративный шум, дать KPI-полосу, плотную таблицу, правый drawer с историей и встроенным скриптом холодного звонка, модалку результата звонка. Логику бэкенда, роли, RLS и импорт не трогаем.

## Что меняется

### 1. `src/components/admin/sales/CompaniesUnified.tsx` — компактизация
- Убрать крупный градиентный блок «Необработанные загруженные базы» (амбер/оранжевая карточка сверху). Смысл сохранить, но переехать в один компактный аккордеон/строку под KPI-полосой (кнопка «Необработанные базы · N»).
- Заголовок «Компании» сжать в одну строку с primary-CTA `Импорт из Excel` и overflow-меню (добавить компанию, в ЧС).
- Табы `В работе / Архив / Чёрный список` оставить, стили компактнее.

### 2. Новый `PriorityKpiStrip` (внутри `LeadsManager` или отдельный файл)
Полоса из 5 кликабельных карточек над таблицей — каждая применяет фильтр:
- **Новые сегодня** (`created_at >= today`)
- **Просрочено** (задачи с `due_date < now` из `sales_tasks` по лидам)
- **Назначены мне** (`assigned_manager_id = currentManagerId`)
- **Без контакта 7+ дней** (`updated_at < now-7d`)
- **Звонки сегодня** (задачи типа `call` с `due_date::date = today`)

Клик по карточке = переключение chip-фильтра. Активная карточка подсвечена.

### 3. `CompanyFilterChips` — быстрые фильтры
Chips вместо трёх Select'ов: `Все · Новые · В работе · Перезвонить сегодня · Просрочено · Без ответа · Есть интерес · КП отправлено`. Кнопка «Фильтры» открывает Sheet с расширенными (регион, менеджер, источник).

### 4. `LeadsManager.tsx` → плотная таблица + drawer
- Заменить текущий row-layout на настоящую `<table>` с sticky header и колонками: Компания · Контакт · Телефон · Источник · Статус · Менеджер · Последняя активность · Следующий шаг · Действия.
- Row hover, overdue-подсветка красным левым бордером, статус-бейджи по спецификации.
- Быстрые действия в строке: `Позвонить` (икон-кнопка), overflow (`Сообщение`, `Заметка`, `Перезвон`, `КП`).
- Клик по строке открывает `CompanyDrawer` (Sheet справа, 460px).
- Существующий `Dialog` детализации удалить — переносим содержимое в drawer.

### 5. Новый `CompanyDrawer.tsx` (Sheet справа)
Секции (аккордеон или табы):
- **Сводка** — ИНН/ОГРН/адрес/сайт/статус (Select) / назначение.
- **Заметки** — inline редактируемая Textarea.
- **Звонки** — фильтр `sales_lead_activities` по `type='call'`.
- **КП / Договор** — переиспользуем существующие кнопки «Создать КП/Договор» из Deals360 flow (`onCreateProposal(...)`) через prop-колбэки.
- **Скрипт звонка** — новый `ColdCallScriptCard`.
- **Тайм-лайн** — все активности по лиду.
- Кнопка низа: `Завершить звонок` → `CallResultModal`.

### 6. Новый `ColdCallScriptCard.tsx`
Табы `Старт · Вопросы · Возражения · Закрытие` с текстами из uploaded JSON (`crm_script_helper_content` + `cold_sales_script.objections`). Плейсхолдеры `[Имя]`, `[Менеджер]` подставляются из лида и текущего юзера. Кнопки: `Скопировать скрипт` (в буфер) и результат-кнопки (`Недозвон · Неинтересно · Перезвонить · Есть интерес · КП отправить · Назначить демо`) — каждая либо ставит статус лида, либо открывает `CallResultModal` с преднастроенным результатом.

Тексты вынести в `src/constants/coldCallScript.ts` (легко редактировать позже).

### 7. Новый `CallResultModal.tsx`
Поля: Результат (Select из 11 вариантов), Комментарий, Боль/потребность (Textarea), Следующий шаг (Select: Перезвон / Демо / КП / Договор / Ничего), Дата следующего касания (DatePicker), Ответственный (Select).
Сабмит:
- пишет `sales_lead_activities` (call + note),
- при `next_step != Ничего` создаёт `sales_tasks` (due_date, assigned_user_id),
- при результате `Неинтересно` меняет `sales_leads.status='not_interested'` (уже есть в LogActivityDialog — переиспользовать логику),
- при `КП отправить` открывает существующий Proposal-flow.
Кнопки: `Сохранить` и `Сохранить и открыть следующую компанию` (переход на следующий лид в отфильтрованном списке).

### 8. Skeleton, empty и no-results
- Skeleton-строки таблицы во время загрузки (сейчас просто «Нет компаний»).
- Empty: `no_companies`, `no_results`, `no_tasks_today` — тексты из JSON.
- Overdue-хайлайт (левая красная полоса + бейдж `Просрочено`).

## Что НЕ трогаем

- Схему БД (`sales_leads`, `sales_tasks`, `sales_lead_activities`, `commercial_proposals` — уже достаточно).
- RLS, `claim_sales_leads`, `ensure_sales_manager_for_current_user`.
- Импорт из Excel (`LeadsImportDialog`).
- Все остальные вкладки sales-дашборда (Deals 360°, КП, Договоры, Отчёт).
- Роли и приглашения менеджеров.

## Технические детали

- Иконочный sidebar `SalesSidebar` не меняется.
- `LEAD_STATUS_MAP` расширить недостающими статусами (`call_today`, `overdue`, `no_answer`, `quote_sent`) — вычисляемые, не хранимые.
- Overdue/next_step вычисляем на клиенте, дергая `sales_tasks` одним запросом при загрузке.
- Скрипт `next` (Сохранить и открыть следующую компанию) — держим `filtered` массив в state, при сохранении находим индекс текущего и открываем drawer со следующим.
- Мобилка: таблица превращается в cards-список; drawer становится fullscreen `Sheet`.

## Файлы

- Изменяю: `src/components/admin/sales/CompaniesUnified.tsx`, `src/components/admin/sales/LeadsManager.tsx`.
- Создаю: `src/components/admin/sales/PriorityKpiStrip.tsx`, `src/components/admin/sales/CompanyFilterChips.tsx`, `src/components/admin/sales/CompanyDrawer.tsx`, `src/components/admin/sales/ColdCallScriptCard.tsx`, `src/components/admin/sales/CallResultModal.tsx`, `src/constants/coldCallScript.ts`.
