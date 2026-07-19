
# План: публичные документы + админ-генератор договоров

Задача состоит из двух независимых частей, обе делаются в рамках одной итерации.

---

## Часть 1. Актуализация публичных документов

Ставим канонический комплект из архива «Публичный комплект документов СИНТАГМА» (ред. 1.0 от 19.07.2026): 9 юридических документов + хаб `/documents` по спецификации из `LOVABLE_PROMPT.md`.

### Файлы контента
- `public/documents/files/01…09_*.pdf` — 9 PDF из архива, положить как есть (кириллические имена).
- `src/content/documents/*.md` — 9 Markdown-файлов из `WEB/`.
- `src/content/documents/manifest.ts` — типизированная копия `WEB/documents.json` (группы, slug, версия, дата, contentPath, pdfPath, аудитория).

### Маршруты (`src/routes/publicRoutes.tsx`)
- Добавить лениво: `/documents` → `DocumentsIndex`, `/documents/:slug` → `DocumentPage`.
- Старые страницы `/public-offer`, `/student-agreement`, `/privacy`, `/personal-data` → `<Navigate>` на соответствующие `/documents/:slug` (`paid-plan-offer`, `user-agreement`, `personal-data-policy`, `personal-data-policy`). Файлы `PublicOffer.tsx`, `StudentAgreement.tsx`, `PrivacyPolicy.tsx`, `PersonalDataPolicy.tsx` удалить.

### Новые страницы
- `src/pages/DocumentsIndex.tsx` — hero «Документы платформы СИНТАГМА», три группы карточек (Compliance / Contracts / Privacy), внизу реквизиты оператора и ссылка на реестр РКН 25-24-013414. Использует `LandingHeader` + `Footer`.
- `src/pages/DocumentPage.tsx` — рендер Markdown через уже установленные `react-markdown` + `remark-gfm` (+ `DOMPurify` если HTML), оглавление из H2, кнопки «Скачать PDF», «Печать», «Назад». Проверка slug по манифесту → 404 при неизвестном. SEO через `react-helmet-async`, `print.css` для чистой печати.

### Навигация и футер
- В `LandingHeader.tsx` и `Footer.tsx` (`src/components/landing/`) добавить пункт «Документы» → `/documents`. В футере заменить старые ссылки на юр. страницы на `/documents/*`.

### Согласия и акцепт
Задача чистит из старых текстов формулу «использование сайта = согласие». В логике регистрации/чекаута оставляем текущее раздельное поведение (уже реализовано в `StudentPepAgreementCard`, `StudentConsentForm`), только меняем ссылки чекбоксов на новые `/documents/user-agreement`, `/documents/personal-data-consent`, `/documents/marketing-consent`. Схему хранения акцептов (id, slug, версия, hash, IP, UA, time) не переделываем — она уже есть в `pep_agreements`/`consent_documents`; добавляем поле `document_slug` и `document_version` в `consent_documents` если их нет (проверим и создадим миграцию только при необходимости).

---

## Часть 2. Админ-генератор «Договор возмездного оказания услуг» для организаций

Клиенты (учебные центры) просят договор от ИП Шафрановский для лицензирования. Нужен генератор в админке, аналогичный `OrgContractsManager`, но: сторона Исполнитель = ИП Шафрановский (из `operatorDetails`), Заказчик = организация-клиент.

### UI и навигация
- Новый пункт `documents` в `AdminSidebar.tsx` (`AdminTabType`): иконка `FileText`, лейбл «Документы».
- Новый компонент `src/components/admin/AdminDocumentsTab.tsx` с табами:
  - «Договоры с организациями» (основное) — список + кнопка «Создать договор».
  - «Шаблоны» — редактируемые шаблоны договоров возмездного оказания услуг (по умолчанию один преднастроенный).
- Регистрация вкладки в `OrganizationDashboard`/`AdminDashboard` где рендерятся таб-компоненты (аналогично `AdminBillingOverview`), с гардом `canSeeAdminTab('documents')` и правом в `rolePermissions.ts`.

### База данных (миграция)
Новая таблица `admin_service_contracts`:
- `organization_id` (FK → organizations), `contract_number` (auto через `get_next_document_number`), `contract_date`, `service_start_date`, `service_end_date`, `subject` (текст «оказание услуг платформы для целей лицензирования …»), `amount` numeric, `status` (`draft|sent|signed|cancelled`), `document_html` (снепшот), `pdf_path`, `template_id` (FK на `admin_service_contract_templates`), `signed_at`, `signature_token`, `created_by`, `created_at/updated_at`.

Новая таблица `admin_service_contract_templates`: `name`, `content_html`, `is_default`, `updated_at`.

Обязательные GRANT/RLS: доступ только пользователям с `has_admin_staff_role('super_admin' | 'admin')` (и `service_role` полный). Для `signature_token` — публичный SELECT через SECURITY DEFINER RPC как в существующих контрактах.

### Дефолтный шаблон
Сеедом миграции вставить шаблон с текстом договора «Договор возмездного оказания услуг» с плейсхолдерами `{{contract_number}} {{contract_date}} {{org_name}} {{org_inn}} {{org_kpp}} {{org_ogrn}} {{org_legal_address}} {{org_director_name}} {{org_director_position}} {{amount}} {{amount_words}} {{service_start_date}} {{service_end_date}}`. Реквизиты Исполнителя — ИП Шафрановский М.М., ИНН 253615392404, ОГРНИП 324253600042754 — берутся из `operatorDetails.ts` автоматически, в шаблоне не редактируются.

### Диалоги
- `CreateAdminServiceContractDialog.tsx` — 3 шага: 1) выбор организации (поиск по `organizations`), 2) параметры (номер авто/ручной, дата, период услуг, сумма, доп. условия), 3) предпросмотр + «Сохранить черновик» / «Отправить на подписание».
- `AdminServiceContractTemplatesEditor.tsx` — редактор шаблонов (rich-text как в `OrgContractTemplateEditor`).

### Экспорт
- Кнопки «Скачать PDF» (через `htmlToPdfPages`) и «Скачать Word» (через `useWordDocumentGenerator` с табличной раскладкой печати/подписей — как в мемори `document-storage-and-pdf-standards`).
- Копирование ссылки на подписание `/sign/:token` (переиспользуем существующий флоу подписания).

### Хук
- `src/hooks/useAdminServiceContracts.ts` — CRUD, realtime подписка на `admin_service_contracts`.

---

## Технические заметки

- Все PDF копировать в `public/documents/files/` вручную (кириллические имена сохраняем — их поддерживает CDN Lovable). В `manifest.ts` `pdfPath` начинается со `/documents/files/`.
- Markdown-контент импортируем как `?raw` через Vite (`import md from '…/legal-readiness.md?raw'`), чтобы не тянуть fetch на runtime.
- Санитизация: если рендерим только Markdown без raw HTML — `DOMPurify` не нужен; ставим `react-markdown` с `skipHtml`.
- Тайтлы/описания страниц под `<title>` <60 символов, `<meta description>` <160.
- Кнопка «Настройки cookie» в футере — оставляем существующий баннер, добавляем ссылку-триггер повторного открытия.
- SEO для `/documents/*`: JSON-LD `LegalDocument` (name, dateModified, version, publisher = «ИП Шафрановский М.М.»).
- Ограничения плана мода: работы не начнутся до подтверждения. После подтверждения — миграция БД пойдёт отдельным шагом (Supabase tool), после апрува миграции — код фронта.

## Что НЕ делаем в этой итерации

- Не меняем закрытые кабинеты и внутренние документы организаций (`OrgContractsManager` не трогаем).
- Не переносим логику баннера cookie (используем существующий).
- Не переводим тексты (документы только на русском, как в архиве).
- Изображения печати/подписи ИП не размещаем на публичной части.
