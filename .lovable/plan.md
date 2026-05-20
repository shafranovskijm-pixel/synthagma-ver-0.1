# Реквизиты оператора: вынести в админку + сразу обновить

## Где сейчас живут реквизиты

Реквизиты ИП **захардкожены в коде**, в админке их менять нельзя:

1. **`src/constants/invoiceTemplate.ts`** → объект `SELLER` (банковские реквизиты в счетах)
2. **`src/constants/operatorDetails.ts`** → объект `OPERATOR` (ФИО, ИНН, ОГРНИП, email)

Используются в: счетах, КП, договорах, актах, блоке подписи/печати, странице «О нас», оферте, политике ПД.

## Новые реквизиты (из загруженного счёта №258/2026)

| Поле | Старое | Новое |
|---|---|---|
| Расч. счёт | `40914810200040551529` | **`40802810200000522079`** |
| Адрес | — | **692481, Приморский край, Надеждинский р-н, с. Вольно-Надеждинское** |
| Телефон | — | **+7 (914) 721 34 24** |
| Банк / БИК / Корр.счёт | ООО «Озон Банк» / 044525068 / 30101810645374525068 | без изменений |
| ИНН / ОГРНИП / ФИО | 253615392404 / 324253600042754 / Шафрановский М.М. | без изменений |

## Что сделаю

### 1. Миграция: новый ключ `operator_requisites` в `app_settings`
Сразу запишу обновлённые значения (включая новый расч. счёт, адрес и телефон). RLS уже корректная: read all, write — только админ.

### 2. Хук `useOperatorRequisites()`
React Query + realtime + fallback на константы, если запись пустая.

### 3. UI в админке — вкладка «Реквизиты оператора» в `AdminSettings`
Форма: ФИО, краткое имя, ИНН, ОГРНИП, email, юр.адрес, телефон + банковский блок (банк, БИК, расч.счёт, корр.счёт, ИНН/КПП банка). Сохранение в `app_settings`. Превью счёта.

### 4. Рефакторинг генераторов
- `generateInvoiceHtml(data, requisites)` принимает реквизиты параметром, добавляются поля `address` и `phone` в шапке счёта.
- Вызывающие места (`useInvoiceGenerator`, `useAdminBilling`, `useDocumentsTab`, `InvoiceView`) тянут из хука.
- Аналогично `exportPlatformProposalPdf`, `generateAct`, `SignatureStampBlock`, `ContractReviewBody`.
- Константы `SELLER` / `OPERATOR` остаются как дефолты-фолбэки.

### 5. Что НЕ трогаю
Юр.тексты в публичных страницах (`PublicOffer`, `PrivacyPolicy`, `PersonalDataPolicy`, `About`, `StudentAgreement`) — там реквизиты вшиты в текст оферты, менять отдельно и осознанно. Подпись/печать (PNG в `src/assets/`) — не реквизиты.

## Файлы

**Создать:** миграция · `src/hooks/useOperatorRequisites.ts` · `src/components/admin/AdminOperatorRequisites.tsx`

**Изменить:** `invoiceTemplate.ts`, `operatorDetails.ts`, `AdminSettings.tsx`, `useInvoiceGenerator.ts`, `useAdminBilling.ts`, `useDocumentsTab.ts`, `InvoiceView.tsx`, `exportPlatformProposalPdf.ts`, `generateAct.ts`, `SignatureStampBlock.tsx`, `ContractReviewBody.tsx`, `CompanyCard.tsx`

После применения плана новые реквизиты автоматически подтянутся во все счета/КП/договоры, а в будущем вы сможете править их сами через админку.
