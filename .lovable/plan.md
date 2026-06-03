## Что чиним

### 1. Загрузка фото профиля → «Bucket not found»
Бакет `avatars` существует и публичный, RLS корректны. Скорее всего ошибка приходит через NGINX-прокси на синтагма.рф: `POST /sb-storage/object/avatars/...` теряет байты или превышает `client_max_body_size`. Также сам код в `OrgProfileTab.tsx` уже использует `from("avatars")` — кода менять не надо, нужно поправить инфраструктуру и UX:
- Добавить в `nginxProxyConfig.ts` строку `client_max_body_size 100M;` для `/sb-storage/` (в .docx обновим версию конфига для админ-страницы `/admin/proxy-setup`).
- В `handleAvatarUpload` / `handleIconUpload` (`OrgProfileTab.tsx`) и `LoginBrandingSettings.tsx` показывать конкретный текст ошибки и логировать `error.message`, чтобы при следующем случае было видно причину (а не просто «Bucket not found»).
- Сделать **fallback**: при ошибке storage через прокси повторять загрузку напрямую через `originalFetch` (минуя rewriteUrl) — добавить флаг `bypassProxy` в `supabase.storage.from(...).upload`.

### 2. Загрузка обложки/логотипа в «Брендирование»
Та же причина (proxy + большой файл). RLS у `org-branding` требует `auth.uid()` первым сегментом пути, а код пишет `${organizationId}/...` — это **вторая причина** молчаливого падения. Фикс:
- Миграция RLS: расширить INSERT/UPDATE/DELETE на `org-branding` так, чтобы пускать любого активного сотрудника организации (через `has_org_staff_permission(org_id, 'branding.manage')` или хотя бы членство в `org_staff`/владельца org).
- Альтернативно (быстрее) — изменить путь на `${user.id}/${organizationId}/...`, чтобы попадать в текущую RLS. Выберу первый вариант, чтобы любой админ организации мог менять брендинг.

### 3. Регистрация по ссылке организации → «errorMessage»
Найден баг в `src/pages/JoinByLink.tsx:233`:
```ts
toast.error("Ошибка регистрации", { description: "errorMessage" });
```
Строка `"errorMessage"` вместо переменной. Фикс — `description: errorMessage`. После этого станет видна реальная причина (скорее всего «User already registered» или валидация пароля), и параллельно:
- Если ошибка типа «email rate limit exceeded» — добавить осмысленное сообщение.
- Перепроверить вызов `signUp` с `data: { full_name, organization_id }` и `emailRedirectTo: ${window.location.origin}/`.

### 4. Самостоятельное добавление ученика на курс (нестабильно)
Посмотрю `useCourseStudentsManager` и edge-функцию `enroll-student` / `create-student-enrollment`:
- Заверну mutation в `safeInvoke` с ретраем (3 попытки, exp. backoff) — это уже стандарт проекта.
- Если падает на проверке лимита тарифа — покажу человеческий тост вместо технической ошибки.
- Добавлю серверный лог в edge для трассировки.

### 5. Долгая загрузка видео + видео грузится только в 1-м уроке (Kinescope для всех)
Сейчас Kinescope-аккаунт включается только на тарифе Professional (memory: `webinar-system`/`kinescope/video-and-webinars`). У вас уже есть платформенный `KINESCOPE_API_TOKEN` в секретах — используем его как **общий аккаунт платформы**:

- Снять plan gate: убрать проверку `plan === 'professional'` для функций видео/Kinescope (оставить её только для **вебинаров** Kinescope Live, если хотите — уточните).
- В `kinescope-proxy` (TUS upload) и `kinescope-create-video-link` всегда использовать `KINESCOPE_API_TOKEN` платформы; параметр `parent_id` рассчитывать как `org_${organizationId}` папку (создать при первой загрузке через Kinescope API), чтобы видео клиентов не смешивались.
- В UI «Видеохостинг Kinescope» в OrgProfileTab показать статус «Подключено платформой — бесплатно» вместо текущего CTA подключить свой ключ; оставить опциональное поле «Свой Kinescope-токен» для тех, кто хочет.
- Фронтенд: в `useLessonVideo` и плеере добавить таймаут загрузки 12 сек + fallback на прямую ссылку из `lessons.video_url`, чтобы спиннер не висел вечно. Логировать, на каком уроке плеер не инициализировался (видимо, у клиента в уроках 2–10 битый embed-URL — добавлю healthcheck в Course Builder, отмечающий проблемные уроки).

### 6. Кнопки «Просмотр/Скачать» в «Протоколы АК» не реагируют
В `DocumentsTab.tsx` для секции `attestation_protocols` обработчики (`onView`/`onDownload`) сейчас, по-видимому, не привязаны к `auto_attestation_protocols.file_url` (как уже работает `auto_education_documents`). Фикс:
- Найти рендер строк протоколов АК и навесить `createSignedUrl('org-documents', file_url, 3600)` для просмотра в новой вкладке и для скачивания (`download` атрибут + ASCII-имя).
- Если у протокола нет `file_url` (старые записи) — перегенерировать через `generateAttestationProtocol.ts` по кнопке.

---

## Технические детали

- **Миграции БД**
  - `org-branding` RLS: позволять INSERT/UPDATE/DELETE при `has_org_staff_permission(org_id,'branding.manage')` ИЛИ `is_org_owner(org_id)`.
  - (опционально) Индекс/поле `org_kinescope_folder_id` в `organizations` для хранения per-org папки в общем Kinescope.

- **Edge functions для редеплоя**
  - `kinescope-proxy`, `kinescope-create-video-link`, `kinescope-migrate-videos` — всегда брать `KINESCOPE_API_TOKEN` из env.
  - `create-student-enrollment` (или эквивалент) — добавить retry + понятные ошибки.

- **Фронтенд**
  - `src/utils/nginxProxyConfig.ts` — `client_max_body_size 100M;` + `proxy_request_buffering off;` для `/sb-storage/`.
  - `src/pages/JoinByLink.tsx` — фикс `description: errorMessage`.
  - `src/components/organization/tabs/OrgProfileTab.tsx`, `LoginBrandingSettings.tsx` — детальные сообщения об ошибках, fallback bypass-proxy для storage.
  - `src/components/organization/tabs/DocumentsTab.tsx` (секция Протоколы АК) — подключить signed-URL view/download.
  - `src/hooks/useOrgFeatures.ts` / `src/constants/orgFeatureCatalog.ts` / `src/constants/subscriptionPlans.ts` — снять Kinescope из ограничений Professional, оставить как «включено всегда».
  - Плеер уроков: таймаут 12 с + fallback на `video_url`.

## Что НЕ трогаю

- Дизайн (luxury minimal, Teal/Cyan) — без изменений.
- Прокси-логику authToken (вход) — не меняю, чтобы не сломать вчерашний фикс.
- Личный Kinescope-токен организации — поле остаётся (приоритет: org-токен → платформенный fallback).

## Уточнение по вебинарам

Вебинары Kinescope Live (а не VOD-видео) сейчас тоже под Professional. Если хотите — снимем гейт и с них (но это уже дороже для платформенного аккаунта). По умолчанию оставлю Professional на вебинары, открою бесплатно только VOD-видео для уроков. Скажете — расширю.
