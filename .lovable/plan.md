## Проблема

1. В «Документы → Контрагенты → Синтагма → Закрывающие» кнопка «Сформировать акт» показывается **только когда актов ещё нет**. Как только появился первый акт — новых по счетам сделать нельзя, и нет связи «этот акт по этому счёту».
2. В счётах организации нет действия «Сделать акт по этому счёту».
3. В «Тариф» есть «Выставить счёт», но нет «Выставить акт»; в «Документах» есть «Сформировать акт», но нет «Выставить счёт на продление». Пользователь хочет, чтобы **оба действия работали в обоих местах**.

## Что сделаю

### 1. Кнопка «Сделать акт» на каждом оплаченном счёте (Документы → Синтагма → Счета)
`src/components/organization/tabs/documents/CounterpartiesSection.tsx`, `renderPlatformInvoices` (стр. 424–449) — добавить в правую группу действий кнопку `FileCheck` «Сделать акт», активную для счетов со статусом `paid` (для неоплаченных — disabled с подсказкой «Сначала отметьте счёт оплаченным»). Клик открывает существующий `showActDialog` с предзаполненными полями:
- `actBasis = "Счёт №{invoice_number} от {invoice_date}"`
- `actAmount = invoice.amount`
- `actDate = сегодня`

Для этого расширю `onShowActDialog` → `onShowActDialog(preset?: { basis; amount })` и прокину предзаполнение в `useDocumentsTab` (сеттеры уже есть — `setActBasis/setActAmount/setActDate`).

### 2. Всегда доступная кнопка «Сформировать акт» в «Закрывающих»
Тот же файл, `renderPlatformClosing` (стр. 454–…): вынести кнопку `<Button>Сформировать акт</Button>` в шапку вкладки (над списком) — она видна и когда актов нет, и когда они уже есть. Пустое состояние оставлю с той же кнопкой.

### 3. Дедуп: не давать делать второй акт по тому же счёту
При открытии диалога из счёта запомнить `sourceInvoiceId` (в `useDocumentsTab` завести локальный state). При сохранении в `org_billing_documents` писать `metadata.invoice_id`. В списке счетов у счёта, по которому уже сформирован акт, показывать бейдж «Акт сформирован» + кнопка становится «Открыть акт» (открывает файл из billingDocs). Проверка через `billingDocs.find(d => d.doc_type==='act' && d.metadata?.invoice_id === inv.id)`.

### 4. «Выставить акт» в «Тариф»
`src/components/organization/SubscriptionTab.tsx` (стр. 112–130): в карточке «Продлите тариф» рядом с «Выставить счёт» добавить второстепенную кнопку `variant="outline"` «Выставить акт». Она эмитит событие `documents.deepLink` (по паттерну из памяти [Documents Hub Commerce]) с командой `open-act-dialog` и параметрами последнего оплаченного счёта, и переводит пользователя на вкладку «Документы → Контрагенты → Синтагма → Закрывающие», где `useDocumentsTab` подхватит команду, откроет `showActDialog` предзаполненным.

Если оплаченных счетов нет — кнопка disabled с тултипом «Сначала оплатите счёт».

### 5. «Выставить счёт» в «Документы» (в шапке «Синтагма»)
В `CounterpartiesSection.tsx`, вкладка `platform`, над `Tabs` (стр. ~820) добавить в правый угол компактную кнопку «Выставить счёт» → `onShowInvoiceDialog`. Так действие доступно и в «Договорах», и в «Счетах», и в «Закрывающих» одинаково.

## Файлы

- `src/components/organization/tabs/documents/CounterpartiesSection.tsx` — кнопки, дедуп, шапка секции.
- `src/hooks/useDocumentsTab.ts` — `sourceInvoiceId` state, приём deepLink-команды `open-act-dialog`, запись `metadata.invoice_id` при генерации акта.
- `src/components/organization/tabs/documents/DocumentDialogs.tsx` — без изменений (диалог уже подходит).
- `src/components/organization/SubscriptionTab.tsx` — вторая кнопка «Выставить акт» + deepLink.
- (проверить) `src/utils/generateAct.ts` / `saveActDocument` — прокинуть `metadata.invoice_id` в `org_billing_documents.metadata`.

## Что НЕ трогаю

- Схему БД: `org_billing_documents.metadata` уже JSONB, миграции не нужны.
- Логику генерации HTML акта, шаблоны, реквизиты ИП Шафрановский М.М.
- Админскую сторону (`AdminBillingOverview`) — там уже всё есть.
