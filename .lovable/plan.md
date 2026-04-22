# Аудит «Продажи» — итог третьей волны

## Сделано в этом проходе

| Улучшение | Статус |
|---|---|
| **Канбан с drag-n-drop** (`@dnd-kit/core`): карточки сделок перетаскиваются между колонками `Лид / КП / Договор / Подпись / Оплачено`. Каждый дроп выполняет реальный SQL-апдейт `commercial_proposals.status` или `sales_contracts.status`. С защитой: «нельзя в Договор без договора» и т.п. — `toast.warning` если сущности нет. | ✅ |
| **Открыть карточку сделки из задачи**: в строке задачи (если у неё есть `lead_id`) появляется иконка `ExternalLink`, которая прыгает в `Deals360` и автоматически выбирает компанию по ИНН (или org_name, если ИНН пуст). Работает и в админ-кабинете, и в OrgSalesManager. | ✅ |
| **Авто-закрытие лида при «Не интересуется»**: если в `LogActivityDialog` выбран результат звонка `not_interested`, статус соответствующего `sales_leads` обновляется на `not_interested` (одновременно с активностью). | ✅ |

## Канбан — нюансы реализации

- Сенсор: `PointerSensor` с `activationConstraint: { distance: 5 }` — клик по карточке (открыть в «Сделки 360°») не конфликтует с drag.
- За drag отвечает только иконка `GripVertical` + основная область — кликабельная.
- `DragOverlay` для плавной анимации.
- Колонка-целевая подсвечивается через `ring-2 ring-primary` при `isOver`.
- Оптимистичное обновление: `setDeals(...)` после успешного апдейта — без полной перезагрузки.

## Файлы, изменённые в этой итерации

- `src/components/admin/sales/SalesKanban.tsx` — полностью переписан с DnD.
- `src/components/admin/sales/SalesTasks.tsx` — пропс `onOpenDeal`, кнопка `ExternalLink`, маппинг `lead_id → inn/org_name`.
- `src/components/admin/sales/LogActivityDialog.tsx` — авто-смена `sales_leads.status = 'not_interested'`.
- `src/components/admin/SalesManager.tsx` — пробрасывает `onOpenDeal` в `SalesTasks`.
- `src/components/organization/sales/OrgSalesManager.tsx` — то же для org-кабинета.

## Что ещё в очереди

- **Прикреплять файл к звонку/заметке** (storage + ссылка в `sales_lead_activities.metadata`).
- **DnD между колонками с подтверждением** для критичных переходов («Договор → Оплачено» — сразу с диалогом «Дата оплаты, сумма?»).
- **Фильтр канбана по менеджеру** (правый верхний угол `SalesKanban`).
