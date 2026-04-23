

# План: убрать дубли, ускорить загрузку, прибраться в коде

Прошёл по проекту и нашёл реальные дубли (а не выдуманные). Ниже — что точно есть и что предлагаю сделать. Делю на 3 итерации, чтобы не сломать ничего разом.

## Что нашёл — фактическая картина

### 1. Email/SMTP — самое большое болото (≈1500 строк дублей)

В проекте уже есть готовый `supabase/functions/_shared/smtp-sender.ts` (186 строк). Им пользуются только **5 функций из ~15**, которые шлют письма:
- ✅ Используют shared: `send-campaign-email`, `send-test-email`, `org-create-contract-signature`, `process-drip-campaigns`, `test-org-smtp`.
- ❌ Не используют (каждая со своим SMTP-клиентом): `send-email`, `send-credentials`, `send-password-reset`, `send-course-invitation`, `send-signing-email`, `send-lead-magnet`, `send-documents-reminder`, `send-staff-invitation`, `notify-course-completion`, `notify-course-order`, `notify-order-status`, `notify-program-order`, `notify-enrollment-request`, `process-reminders`, `process-document-expiry-reminders`, `process-signature-expiry-reminders`, `test-smtp`.

При этом 7 функций реализуют SMTP вручную через `Deno.connectTls` (свои base64Encode/encodeSubject), а 2 (`notify-course-order`, `notify-order-status`) тянут постороннюю библиотеку `denomailer`. То есть **три разных способа отправлять одно и то же письмо**.

**Что делаю:**
- Расширяю `_shared/smtp-sender.ts`: добавляю `sendPlatformEmail({to, subject, html, from?})` с rate-limit и пресетом для платформенного SMTP (`SMTP_HOST/PORT/USER/PASS/FROM` из env).
- Все 17 функций выше переписываю на 5–10 строк: импорт + вызов `sendPlatformEmail`. Ручные SMTP-handshake'и + `denomailer` — удаляю.
- `test-smtp` сливаю в `test-org-smtp` (одна функция с параметром `{scope: "platform"|"org"}`), вторую удаляю.
- `send-email` остаётся «тонкой обёрткой над `sendPlatformEmail`» для обратной совместимости (его дёргают `BroadcastManager.tsx` и `CommercialProposals.tsx`).

**Эффект:** ~1200 строк edge-кода уходит, единое место правок (TLS-хитрости, base64, заголовки), единый rate-limit.

### 2. Хуки кабинета организации — параллельные близнецы

```
useCourseDetails.ts        (301)  ─ используется в CourseDetailsContent.tsx
useCourseDetailsLogic.ts   (327)  ─ используется в CourseDetailsModal.tsx
useCoursesTab.ts           (305)  ─ используется в CoursesTab.tsx
useCoursesTabLogic.ts      (401)  ─ используется в useOrganizationDashboard.ts
```
Это **две версии одного и того же** — Modal-вариант остался от старого диалога, а Page-вариант от новой страницы. Логика 80% идентичная (загрузка студентов, открытие редактора, удаление, дублирование, FRDO-настройки).

**Что делаю:**
- Один `useCourseDetails(course, organizationId, opts)` с опциональными колбэками, оба места переводятся на него.
- Один `useCoursesTab(opts)` (универсальный), `useCoursesTabLogic` удаляю.
- Удаляю `useCourseDetailsLogic.ts`, `useCoursesTabLogic.ts`. Минус ~700 строк.

### 3. GigaChat — 3 функции до сих пор без shared-клиента

`_shared/gigachat-client.ts` уже используют 9 функций. Без него:
- `generate-cover` (свой токен-flow для генерации картинок)
- `generate-image` (то же)
- `manage-secret` (нет, тут не GigaChat — ложное срабатывание грепа, оставляю)

**Что делаю:** в `_shared/gigachat-client.ts` добавляю `getGigaChatImage(prompt)` и переключаю `generate-cover`/`generate-image` на shared. Один пул токенов, один retry, один rate-limit.

### 4. Reminder-функции — три почти одинаковые

```
process-reminders                       ← общие напоминания (студенты)
process-document-expiry-reminders       ← документы на подпись
process-signature-expiry-reminders      ← подписи
process-invoice-payment-reminders       ← счета (уже использует shared)
```
Первые три имеют каждая свой SMTP-клиент + свой шаблон HTML, хотя различаются только SQL-запросом и темой письма.

**Что делаю:** оставляю 3 функции (логика разная, объединять не стоит), но все три — на `sendPlatformEmail` + общий шаблон письма из `_shared/email-html-utils.ts` (там уже есть базовый wrap). Минус ~300 строк.

### 5. Производительность — что можно ускорить

Не выдумываю микро-оптимизации, перечисляю реальные места:

- **`src/integrations/supabase/types.ts` — 10038 строк.** Это автоген, не трогаем, но он пересобирается при каждом `tsc`. Уже ничего не сделать — справочно.
- **`OrgSidebar.tsx` (658 строк) + `sidebar.tsx` (637).** На каждой смене раздела сайдбар целиком ререндерится из-за `useStaffPermissions` и `useOrgFeatures` хуков, которые возвращают новые объекты. Оборачиваю результат в `useMemo`/`useCallback`, разбиваю меню на `<SidebarSection>` подкомпоненты с `React.memo` — клик по пункту меню становится мгновенным.
- **`CoursesTab.tsx` (547) + `CourseDetailsContent.tsx` (424).** Много `useEffect` с зависимостями от массивов курсов → лишние перезапросы. Прогоняю и заменяю на `useQuery` с правильным `queryKey` где это уже Tanstack Query.
- **`BulkDocumentGenerator.tsx` (849).** Перезапрашивает шаблоны при каждом тике прогресса. Выношу `useTemplates()` отдельным мемо.
- **Lazy-import**: проверяю, что `WebinarsManager`, `BulkDocumentGenerator`, `Deals360`, `SalesOverview`, `CampaignEditor`, `RichTextEditor` импортируются через `React.lazy` в роутерах — чтобы первоначальный bundle не тащил их.

### 6. Неиспользуемые/мёртвые файлы

Проверю и удалю кандидатов:
- `useCoursesTabLogic`, `useCourseDetailsLogic` — после миграции (см. п.2).
- `elevenlabs-tts` edge-функция и `useElevenLabsTTS.ts` — по памяти ElevenLabs удалён в пользу SaluteSpeech, но файлы могли остаться.
- `test-smtp` после слияния в `test-org-smtp`.

Перед удалением каждого файла делаю `grep` по `src/` — если хоть одно вхождение, оставляю и помечаю.

### 7. Мелкая ошибка в консоли

В логах сейчас висит:
```
Warning: Function components cannot be given refs.
Check the render method of `HealthTab` → Badge
```
В `HealthTab.tsx` на `Badge` навешан `ref` (видимо для tooltip). Чиню за пять минут — оборачиваю в `React.forwardRef` либо убираю ref.

## Что НЕ делаю в этой пачке
- Не трогаю авто-генерируемый `supabase/types.ts`.
- Не переписываю auth/SMTP-протокол шифрования паролей — там всё ок.
- Не меняю поведение писем (тема/шаблоны/получатели) — только техническая консолидация.
- Не объединяю `notify-*` в одну функцию — разная бизнес-логика по разным таблицам.

## Порядок работ (3 коммита, можно остановиться после любого)

**Итерация A — SMTP-консолидация (самое ценное)**
- Расширяю `_shared/smtp-sender.ts`.
- Переписываю 17 send-/notify-/process- функций.
- Удаляю `test-smtp`, `denomailer` зависимости.
- Чиню warning в `HealthTab`.

**Итерация B — хуки кабинета**
- Объединяю `useCourseDetails*` и `useCoursesTab*`.
- Удаляю `*Logic` версии.
- Проверяю, что Modal и Page одинаково работают.

**Итерация C — GigaChat shared + ререндеры сайдбара**
- `getGigaChatImage` в shared, миграция `generate-cover`/`generate-image`.
- `useMemo`/`React.memo` для `OrgSidebar`.
- Lazy-импорты тяжёлых вкладок проверяю и докручиваю.

## Как проверим
1. Все системные письма (регистрация, восстановление пароля, КП, уведомления о заказе) уходят как раньше — отправляю тестовые на свой ящик после каждого коммита.
2. Открытие карточки курса в кабинете организации (Modal-вариант + Page-вариант) — обе версии работают идентично.
3. Сборка фронта: `vite build` не ругается, размер initial bundle не вырос (в идеале — упал на 50–100 KB после lazy).
4. Console clean: warning про `HealthTab` пропадает.
5. Тестовая ИИ-генерация обложки курса — работает через shared GigaChat-клиент.

