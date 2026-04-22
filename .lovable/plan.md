

# Аудит документооборота: что починить и улучшить

Прошёл по всему функционалу: вкладки `kpi/counterparties/incoming/orders/protocols/certificates/diplomas/testimonials/programs/journals/frdo/constructor/org/signatures/pd_requests/recycle_bin`, хук `useDocumentsTab`, хук корзины, KPI-дашборд, edge-функции напоминаний и cron-задачи.

## Узкие места по приоритетам

### A. Критичные баги (точно сломаются у пользователя)

1. **KPI-дашборд считает чужие договоры**. В `useDocumentsKpi` запросы `contracts_total/signed/pending` идут к `company_documents` **без `organization_id` фильтра** — берёт глобально (RLS отрежет, но JOIN с companies не делается). У организации с 0 контрагентов покажет 0, у админа — все договоры платформы. Нужно фильтровать через `companies!inner(organization_id)`.

2. **`org_billing_documents` без soft-delete и без deleted_at**. Удаление в `handleDeleteBillingDoc` — жёсткий DELETE из БД и Storage. В корзине эти документы **никогда не появятся**, восстановить нельзя. То же для `org_documents` при удалении из `DocumentArchiveView` и `OrgDocumentsManager` — обычный `.delete()` без `update({deleted_at: now()})`.

3. **`incoming_documents.file_url` хранит signed URL с TTL 1 год**. Через год ссылки протухнут — вкладка «Входящие» покажет битые `<a href>`. Открытие должно идти через `createSignedUrl(file_path, 3600)` каждый раз, как в `DocumentArchiveView`.

4. **`process-document-expiry-reminders` шлёт только in-app уведомления**, не email. Документы организации (лицензии, аккредитации) истекают — ответственное лицо узнаёт только если зашло в кабинет. Для `org_documents` нет email-канала.

5. **Корзина игнорирует RLS-проверку при `purgeOne`**. Любой залогиненный пользователь, отправив правильный `id`, может прибить запись окончательно (RLS должна спасать, но `restore_document` SECURITY DEFINER не проверяет владение — `UPDATE ... WHERE id = $1` без `organization_id`). Это **дыра**: с валидным `id` чужой организации можно восстановить чужой документ. Нужно проверять `organization_id = current_organization_id() OR has_role('admin')`.

6. **`DocumentsTab` стартует на вкладке `counterparties`** (`useState<DocumentSubTab>("counterparties")`), но ссылка из уведомления KPI/корзина/expiry приземляется не туда. Нет deep-link через query-param (есть только sessionStorage `openSignatureId`). Из письма «Документ истекает через 7 дней» пользователь должен кликнуть и попасть на `org`-вкладку и подсветку — сейчас попадает на «Контрагентов».

### B. Перфоманс и масштабирование

7. **`useDocumentsKpi` делает 22 параллельных запроса** к Supabase каждый раз при открытии KPI и при `refresh`. На реальных данных (`org_documents` 375 строк, `education_document_records` 255 строк) — 22 round-trip × ~80мс = 1.7сек. Нужен **single RPC** `get_documents_kpi(p_organization_id)` с одним запросом и агрегатом.

8. **`useRecycleBin` грузит 8 таблиц параллельно по 500 строк каждая** (макс 4000 объектов в память). Скролл и поиск работают через `filter` по всему массиву — на корзине с 2000+ записей будет тормозить ввод в поле поиска. Нужна **серверная пагинация** + RPC `list_recycle_bin(p_organization_id, p_search, p_limit, p_offset)`.

9. **`SignaturesJournal.load()`** — `select * limit 1000` без серверного фильтра по статусу/датам. Все фильтры работают в памяти. Для админа на платформе с 10k подписаниями: после 1000 строк остальное недоступно (silent truncation). Нужно прокинуть фильтры в `.from().select()` и убрать `limit(1000)` либо сделать пагинацию.

10. **`useDocumentsTab` в одном `useEffect` грузит 4 независимых запроса последовательно** (organizations × 2, billing, invoices, companies + company_documents). Нужно `Promise.all` или вообще использовать `react-query` для кэша.

### C. UX-баги и плавающие плашки

11. **Сайдбар вкладок `lg:w-56 xl:w-64` + правый контент `flex-1`**. На 1280px при открытом боковом меню организации остаётся ~640px на контент — KPI-дашборд `grid-cols-2 md:grid-cols-4` ломается, цифры жмутся. Нужно `md:grid-cols-2 xl:grid-cols-4`.

12. **`activeItem` через `find()` без фолбэка**: если пользователь переключил план и `orders` отключился (`ordersOnly`), а сохранённое состояние осталось `orders`, `find` вернёт `undefined`, и `<activeItem.icon>` рухнет с `Cannot read properties of undefined`. Нужен фолбэк на `kpi`.

13. **`ContractGenerator` сохраняет договор по `ilike(name, companyName)`** — если имя компании содержит `%` или `_` (служебные символы LIKE), запрос вернёт неверные строки или ноль. Нужен экранирование либо `eq` с точным совпадением.

14. **`handleViewDoc` для billing-documents делает `fetch(url)` и пересоздаёт blob** — для PDF/DOC файлов это сломает рендер (откроет как text/html). Сейчас работает только потому что в billing-documents хранится HTML. Если когда-нибудь сохранят PDF — белый экран.

15. **Просмотр входящих документов**: в `IncomingDocumentsManager` нет dialog-просмотра, только `<a target="_blank">`. Для сканов PDF/JPG это норм, но для DOCX браузер скачает файл вместо превью — пользователь думает «не открывается».

16. **Дубль маршрута `/organization/documents`**: страница `OrganizationDocuments` редиректит на `/organization?tab=org-documents`, но саму вкладку `org-documents` в `OrgDashboardSidebar` уже не каждый видит — для большинства это под `tab=documents`. Прямые ссылки из писем ломаются.

17. **В `DocumentsTab` при `activeTab='journals'` рендерится `JournalsManager` внутри ещё одного `bg-card border` контейнера** — двойная обводка с разными радиусами на 2k мониторе выглядит как баг.

### D. Чего не хватает (фичи для следующего этапа)

18. **Нет массового скачивания** в журналах (выделить чекбоксами 50 удостоверений → ZIP-архив с PDF). Сейчас только поштучно. Это самый частый запрос для подачи в ФРДО офлайн.

19. **Нет тегов/категорий** для входящих документов кроме 4 базовых типов (`contract/act/invoice/other`). Нужны произвольные ярлыки («2026», «Минобрнауки», «На оплате»).

20. **Нет полнотекстового поиска по содержимому** документов. Сейчас ищем только по name. Для договоров/протоколов критично искать по тексту (нужен `tsvector` индекс с триггером, либо клиентский OCR-индекс).

21. **Нет связи КП → договор → счёт → акт** в одной карточке. В `Deals360` (продажи) она есть, в документообороте — нет. «Финансовая карточка контрагента» — сейчас «Контрагенты» показывает только договоры, без привязанных счетов и актов.

22. **Нет аудита действий**. Кто и когда удалил документ из корзины окончательно — нигде не записывается. Триггер `auto_audit_log` для документов не настроен.

23. **Нет уведомлений о просроченном договоре с компанией** (`company_documents.contract_date + access_days`). KPI считает «contracts_pending», но истёкшие договоры с клиентами не выделяются.

24. **`org_billing_documents` хранит только Word/HTML**. Нет генерации **PDF с электронной печатью** — для отправки счёта клиенту приходится сначала скачать `.doc`, открыть в Word, преобразовать в PDF. Нужна интеграция с уже существующим `html-to-pdf` edge-функцией.

25. **Нет корзины для `org_billing_documents`** — счета и акты удаляются окончательно (см. п.2).

26. **Нет «Реестра уведомлений ПД (152-ФЗ)»** — для регулятора нужна отдельная страница с экспортом всех `data_subject_requests` за период в формате Роскомнадзора.

## План работ

### Итерация 1 — Критичные баги и безопасность
1.1. Починить `useDocumentsKpi.contracts_*` через JOIN с `companies` и `organization_id` фильтр.
1.2. Перевести удаление `org_billing_documents`, `org_documents` на soft-delete (миграция: добавить `deleted_at/deleted_by` в `org_billing_documents`, обновить `useDocumentsTab.handleDeleteBillingDoc`, `OrgDocumentsManager.handleDelete`, `DocumentArchiveView.handleDelete`). Добавить эти таблицы в `useRecycleBin`.
1.3. Исправить дыру в `restore_document` — добавить проверку владения через `EXECUTE` с подзапросом по `organization_id`.
1.4. `incoming_documents.file_url` — заменить на хранение `file_path` и генерацию signed URL при открытии (хук `useIncomingDocuments` уже хранит `file_path`, нужно в `IncomingDocumentsManager` открывать через signed URL вместо прямого `<a href>`).
1.5. `process-document-expiry-reminders` — добавить отправку email через SMTP (как в `process-signature-expiry-reminders`) для `org_documents` со сроком ≤30/14/7/1 дней.
1.6. Фолбэк `activeItem || NAV_ITEMS[0]` в `DocumentsTab`.

### Итерация 2 — Производительность
2.1. Создать RPC `get_documents_kpi(p_org_id)` (1 запрос вместо 22) — агрегирует все 22 счётчика + 6-месячные тренды через `generate_series`.
2.2. Создать RPC `list_recycle_bin(p_org_id, p_search, p_limit, p_offset)` с UNION ALL по 8 таблицам и серверной пагинацией.
2.3. `SignaturesJournal` — убрать `limit(1000)`, прокинуть фильтры (status, type, dateFrom, dateTo) в SQL `.eq()/.gte()/.lte()`, добавить пагинацию `Показать ещё`.
2.4. `useDocumentsTab` — объединить 4 запроса в один `Promise.all`.

### Итерация 3 — UX и чего не хватает
3.1. KPI grid `md:grid-cols-2 xl:grid-cols-4` (исправить 1280px).
3.2. Deep-link через `?tab=org&doc=<id>` — `useDocumentsTab` читает search-params на mount.
3.3. `ContractGenerator.onSave` — экранирование `%/_` в `ilike` через `replaceAll`.
3.4. Превью входящих в Dialog (PDF/JPG inline через iframe/img).
3.5. Массовое скачивание ZIP в `EducationDocumentsJournal` (уже есть `BulkDocumentGenerator`-логика — переиспользовать).
3.6. Связь «Контрагент → договоры/счета/акты в одной карточке»: расширить `CounterpartiesSection` чтобы при выборе компании показывал и `company_documents`, и `subscription_invoices`, и `org_billing_documents` с buyer_inn = ИНН компании.
3.7. PDF-генерация счетов через `html-to-pdf` edge-функцию (флаг «Сохранить как PDF» в `handleSavePendingInvoice`).

### Итерация 4 — Новые фичи (отложить, спросить)
4.1. Полнотекстовый поиск (`tsvector` + GIN-индекс).
4.2. Произвольные теги для входящих.
4.3. Реестр 152-ФЗ для Роскомнадзора (отдельная страница экспорта).
4.4. Аудит-лог удалений документов (триггер `auto_audit_log`).

## Что НЕ делаю
- Не переписываю `DocumentsTab` структурно (компонент уже хорошо разбит).
- Не трогаю `JournalsManager`, `FRDOManager`, `EducationDocumentsJournal` логику — они в отдельной памяти.
- Не делаю тяжёлый OCR/полнотекстовый поиск (Итерация 4 — отдельный спринт).

## Решение от вас

Какой объём делаем?

1. **Итерация 1 + 2** (рекомендую — критичные баги + производительность) — 1 крупный заход.
2. **Только Итерация 1** (срочные баги и безопасность) — обязательный минимум.
3. **Все 3 итерации** (1+2+3) — большой заход, плюс UX-полировка.
4. **Все 4 итерации** — максимально, включая новые фичи.
5. **Свой набор** — скажите номера пунктов.

