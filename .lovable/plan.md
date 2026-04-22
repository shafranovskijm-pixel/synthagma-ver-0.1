# Аудит «Продажи» — итог второй волны

## Сделано в этом проходе

| Улучшение | Статус |
|---|---|
| Sticky-сайдбар продаж (admin) — `sticky top-2 self-start max-h-[calc(100vh-1rem)] overflow-y-auto` | ✅ |
| `Deals360` принимает `initialSelectedInn` и реагирует на изменение через `useEffect` | ✅ |
| `SalesManager`: новый колбэк `handleJump(tab, inn)` пробрасывает выбранный ИНН в `Deals360` | ✅ |
| `OrgSalesManager`: то же самое для кабинета организации | ✅ |
| `SalesOverview.onJump` теперь поддерживает 2-й параметр `inn?: string \| null` | ✅ |
| Клик по «Топ-5 горячих сделок» → `safeJump('deals', d.inn)` (карточка автоматически выбирается) | ✅ |
| Клик по алерту «КП без ответа» → `safeJump('deals', p.company_inn)` (раньше вёл на список КП без контекста) | ✅ |
| **Редактируемый план месяца**: иконка карандаша → инпут → upsert в `app_settings` (`setting_key = 'sales_month_plan'`). Доступно только админам (organizationId не задан). | ✅ |
| **Период лидерборда менеджеров**: Select (Этот месяц / 30 дней / Квартал) — пересчитывает `proposals` с `created_at >= leaderSince` | ✅ |

## Что ещё в очереди (не критично)

- **Канбан с drag-n-drop** этапов (лид → КП → договор → подписание → оплачено): `@dnd-kit/core` + апдейт статусов соответствующих сущностей. `SalesKanban.tsx`.
- **Записать звонок / Заметка**: уже расширены полями (длительность, результат, авто-задача) — можно добавить «прикрепить файл» и автозамыкание сделки если результат = «не интересно».
- **«Открыть карточку сделки» из строки задачи**: проброс из `SalesTasks.onOpenDeal` через родителя в `Deals360`.

## Файлы, изменённые в этой итерации

- `src/components/admin/sales/SalesSidebar.tsx` — sticky.
- `src/components/admin/sales/Deals360.tsx` — `initialSelectedInn` + `useEffect`.
- `src/components/admin/SalesManager.tsx` — `handleJump`, `dealSelectedInn`, проброс в `Deals360`.
- `src/components/organization/sales/OrgSalesManager.tsx` — то же для org-кабинета.
- `src/components/admin/sales/SalesOverview.tsx` — план из `app_settings`, его редактор, период лидерборда, клик по сделке/алерту с ИНН, импорт sonner вместо use-toast (которого в проекте нет).

