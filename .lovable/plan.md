
## 1. Диагностика: «GitHub-деплой не видит футер / нет вкладки Документы»

Проверил:
- `APP_VERSION = 1.0.78`, `pwaCacheVersion = sintagma-1.0.78`, `manifest?v=1.0.78` — версия уже поднята, ваш скрин снизу («Синтагма · v1.0.78 · 16.07») это подтверждает.
- В `src/components/landing/Footer.tsx` пункт **Документы** уже присутствует в колонке «Платформа» (строка 63) и виден на вашем 2-м скриншоте.
- Значит проблема не в коде, а в том, что: (а) сборка на GitHub-раннере действительно бежит на актуальном коммите, и (б) SW/браузер уже подхватил новую версию. То, что вы видите одновременно «Документы в футере есть» и «вкладки Документы нет в админке» — это две **разные** вещи: пункт **Документы в админ-сайдбаре никогда не добавлялся**. Это и делаем ниже.

Никакой отдельной инвалидции кэша для этой задачи не потребуется — bump `APP_VERSION` уже в общем pipeline.

## 2. Что добавляем в админку

Новая вкладка **«Документы»** в `AdminSidebar` (иконка `FileText`, между «База компаний» и «Маркетплейс»). Открывает раздел с тремя функциями (все три, как вы просили):

1. **Скачивание** (DOC/PDF без сохранения) — быстрый режим.
2. **Сохранение в БД** — новая таблица `admin_generated_documents` с историей и повторным скачиванием.
3. **Отправка на подпись** — интеграция с существующей `document_signatures` (ПЭП, штамп ИП Шафрановский).

## 3. Шаблоны (все 4 группы)

| Шаблон | Стороны | Ключевые переменные |
|---|---|---|
| Договор возмездного оказания услуг | ИП Шафрановский ↔ Организация-заказчик | № договора, дата, предмет, сумма, срок, реквизиты обеих сторон |
| Договор безвозмездного оказания услуг | ИП Шафрановский ↔ Организация-заказчик | № договора, дата, предмет, срок, реквизиты |
| Согласие на обработку ПДн (физлицо-слушатель) | Слушатель → Оператор ИП Шафрановский | ФИО, паспорт, адрес, цели, срок (152-ФЗ) |
| Пакет: Согласие на маркетинг + Соглашение об ЭП (ПЭП) + Поручение на обработку ПДн (DPA) | Оператор ↔ Заказчик/Слушатель | ФИО/наименование, email, цели, перечень поручаемых операций |

Все шаблоны — HTML A4, Times New Roman, реквизиты ИП Шафрановский из `src/constants/operatorDetails.ts`, блок печати+подписи `<SignatureStampBlock />` в конце.

## 4. Мастер генерации (единый flow)

Пошаговый диалог `AdminDocGeneratorDialog`:

1. **Тип документа** — карточки 4 шаблонов.
2. **Тип заказчика** (для договоров) — юрлицо / ИП / физлицо (для согласий — только физлицо).
3. **Данные заказчика** — переключатель **«Из базы» / «Ввести вручную (+ DaData по ИНН)»**:
   - Из базы: `<Select>` по `organizations` и/или `companies` с автозаполнением.
   - Вручную: поля + кнопка «Подтянуть по ИНН» через существующий DaData-хук (`useOrgRequisites`/аналог).
4. **Параметры документа** — № (авто через `get_next_document_number('admin_contract')` или вручную), дата, предмет, сумма (для возмездного), срок.
5. **Действие** — три кнопки:
   - **Скачать DOC** (`useWordDocumentGenerator` — уже есть, табличный layout под штамп).
   - **Скачать PDF** (печать через `printHtmlToPdf`).
   - **Сохранить в историю** (INSERT в `admin_generated_documents`).
   - **Отправить на подпись** (создать запись в `document_signatures`, статус `pending`).

## 5. Раздел «История» на той же вкладке

Таблица: дата, тип, № документа, заказчик, статус (`draft` / `sent_for_signature` / `signed`), действия (Скачать / Открыть подписант / Удалить). Фильтры по типу и статусу, поиск по контрагенту.

## 6. Технические детали

**Новые файлы (frontend):**
- `src/pages/admin/AdminDocumentsTab.tsx` — экран вкладки (список + кнопка «Создать»).
- `src/components/admin/documents/AdminDocGeneratorDialog.tsx` — мастер.
- `src/components/admin/documents/AdminDocumentsHistory.tsx` — таблица истории.
- `src/lib/adminDocTemplates/` — 4 HTML-шаблона (`paidContract.ts`, `freeContract.ts`, `pdnConsent.ts`, `mixedPackage.ts`) + общий `renderTemplate(html, vars)`.
- `src/hooks/useAdminDocuments.ts` — CRUD над `admin_generated_documents`.

**Правки:**
- `src/components/admin/AdminSidebar.tsx` — добавить пункт `documents`.
- `src/pages/AdminDashboard.tsx` — case `activeTab === "documents"`.
- Тип `AdminTabType` — добавить `"documents"`.

**Backend (миграция):**
```sql
CREATE TABLE public.admin_generated_documents (
  id uuid PK default gen_random_uuid(),
  doc_type text NOT NULL,        -- paid_contract | free_contract | pdn_consent | mixed_package
  doc_number text,
  doc_date date NOT NULL,
  counterparty_name text NOT NULL,
  counterparty_inn text,
  counterparty_kind text,        -- legal | ip | individual
  variables jsonb NOT NULL,
  html_content text NOT NULL,
  status text NOT NULL default 'draft',
  signature_id uuid REFERENCES document_signatures(id),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.admin_generated_documents TO authenticated;
GRANT ALL ON public.admin_generated_documents TO service_role;
ALTER TABLE ... ENABLE ROW LEVEL SECURITY;
-- Политика: только has_admin_staff_role(auth.uid(),'super_admin' | 'documents')
```

Плюс расширить `get_next_document_number` серией `admin_contract`.

## 7. Bump версии
`APP_VERSION → 1.0.79`, `pwaCacheVersion → sintagma-1.0.79`, manifest `?v=1.0.79`.

## 8. Что НЕ трогаем
- Публичный раздел `/documents` и PDF в `/legal-files/` уже актуальны.
- Существующий `ContractGenerator` в кабинете организации остаётся как есть — новый генератор живёт в админке отдельно.
