# Диагностика «Build unsuccessful / Preview is out of date» — SHA 199dc74a3

Только чтение. Ничего не изменено: файлы, коммиты, миграции, БД, секреты, функции, публикация — не тронуты.

## 1. Первая ошибка build

**Ошибок сборки на 199dc74a3 воспроизвести не удалось.** Прогоны в чистом рабочем дереве этого SHA:

- `git log -1` → `199dc74a3 feat: route group packages through client Word contracts`, `git status --porcelain` → пусто.
- Typecheck (`tsgo --noEmit`) → exit 0, ноль диагностик.
- `vite build` → `✓ built in 44.43s`, PWA `precache 289 entries`, ни одного `error`/`Could not resolve` в логе. Единственный шум — `npm notice New major version of npm available`.
- `vitest run` → `Test Files 95 passed (95)`, `Tests 873 passed (873)`.

Вывод: релевантного лога ошибки нет, потому что ошибки нет. Баннер «Build unsuccessful / Preview is out of date» относится к платформенному прогону, а не к содержимому кода этого SHA (типовые причины: прерванный/устаревший прогон предыдущей ревизии либо остановленный dev-preview, требующий рестарта). Внутренний лог платформенного билда мне из Plan-режима недоступен — если он у вас есть в UI, пришлите первые 30 строк, и я сопоставлю.

## 2. `supabase migration list --linked`

Команда **выполнена быть не может** в этой среде, а не «упала»:

- `which supabase` → not found; в `node_modules/.bin` бинаря CLI нет;
- `SUPABASE_ACCESS_TOKEN` не задан (`TOKEN_MISSING`), т.е. `--linked` не авторизуется;
- установка CLI была бы изменением среды — в Plan-режиме запрещено.

Эквивалент read-only получен напрямую из `supabase_migrations.schema_migrations` (REMOTE) и `ls supabase/migrations` (LOCAL):

- LOCAL: **535** файлов; REMOTE: **526** записей.
- Окно 2026-08-08…09:

```text
version           LOCAL                                             REMOTE
20260808000537    2d7d9fe9-…                                        применена
20260808001702    f6b708c8-…                                        применена
20260808041330    — (файла нет)                                     применена  <- remote-only
20260808101500    revoke_anon_issue_education_document_batch.sql    нет        <- local-only
20260808101902    440074f2-…                                       применена
20260808142000    transfer_torgi_mailing_assets_…sql                нет        <- local-only
20260809113034    f4fd9d28-…                                        применена
20260809122943    0778c296-…                                        применена
20260809123731    a854cd8c-…                                        применена
20260809223500    revoke_anon_mailing_warmup_rpc.sql                нет        <- local-only
```

Полное перечисление всех 535/526 версий требует ещё одного read-only запроса постранично (`schema_migrations` порциями) — `psql` под sandbox-ролью к схеме `supabase_migrations` доступа не имеет (`permission denied for schema supabase_migrations`), поэтому только через инструмент чтения БД.

## 3. Проверка заявленного drift

- Версия **`20260809123000` отсутствует и в REMOTE, и в LOCAL** — такого drift нет. Это имя файла из ветки `codex/email-warmup-mvp`; при применении Lovable перезаписал версию.
- **`20260809113034` присутствует и локально, и в REMOTE, с тем же SQL**: оба начинаются с `-- Closed deliverability MVP for organization senders.` / `ALTER TABLE public.mailing_senders ADD COLUMN IF NOT EXISTS warmup_enabled …`; длина REMOTE-стейтментов 10 839 символов, локальный файл 10 839 байт. Т.е. deliverability-MVP применён именно под этой версией.
- Единственный drift — **не remote-only, а local-only**: три файла (`20260808101500`, `20260808142000`, `20260809223500`) плюс одна remote-only запись `20260808041330`. Причём `20260809223500_revoke_anon_mailing_warmup_rpc.sql` (338 B) — байтовый дубликат уже применённой `20260809123731` (337 B, без завершающего перевода строки), а `20260808142000` — уже выполненный ранее data-transfer.

## 4. Tombstone

Для `20260809123000` tombstone **не нужен** — такой версии нет ни в одной стороне.

Если позже потребуется закрыть local-only дубликаты, безопасная форма (описание, файл НЕ создаю):

```text
supabase/migrations/<version>_noop_already_applied.sql
-- No-op tombstone. Этот SQL уже применён в проекте как версия <applied_version>.
-- Файл существует только чтобы CLI-история совпадала с remote. Ни одного executable-стейтмента.
```

Условия безопасности: только строки-комментарии, ноль DDL/DML, имя версии совпадает с ожидаемой CLI-версией, без `GRANT`/`REVOKE`.

## 5. Минимальный план исправления и проверки (без side effects)

1. Снять баннер: пересобрать/перезапустить превью платформы на 199dc74a3 (перезапуск dev-server), затем повторно посмотреть статус. Кода это не касается.
2. Если платформенный лог покажет реальную ошибку — прислать первые строки; исправление будет отдельным точечным патчем.
3. Drift оставить как есть либо (по вашему решению, отдельной задачей) привести историю в порядок только comment-only tombstone'ами; никаких повторных прогонов `20260808142000` и `20260809223500` — их эффект в БД уже есть (`has_function_privilege` по `set_mailing_sender_warmup`: anon=false, PUBLIC=false, authenticated=true — подтверждено ранее).
4. Проверка (все read-only): `tsgo --noEmit`, `vite build`, `vitest run`, повторное сравнение LOCAL/REMOTE версий. Ни миграций, ни деплоя функций, ни публикации.
