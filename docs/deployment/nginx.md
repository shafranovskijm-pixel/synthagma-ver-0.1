# Статический выпуск СИНТАГМЫ через Nginx

Пакет использует уже собранный `dist`. Он не переносит backend, не меняет API, не устанавливает production TLS-конфиг и не выполняет сборку. Все локальные файлы и результаты сохраняются на D:. Установка на существующем сервере и переключение production требуют согласованной цели; localhost preview использует отдельный корень и порт `127.0.0.1:8088`.

## Проверка исходников и публичных настроек перед упаковкой

Зафиксировать полный `git rev-parse HEAD`, `git status --short`, команду успешной сборки `npm run build`, её время и результаты проверок. Сборка должна быть сделана из этого checkout после последних изменений. Манифест записывает HEAD, список изменённых tracked-файлов и SHA256 diff frontend; они отражают исходники на момент упаковки, сами по себе не доказывают происхождение старого `dist`.

Сверить точные build-time значения `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` и `VITE_SUPABASE_PROJECT_ID` с работающим исходным frontend. Указывать в отчёте только SHA256 публичных настроек/ключа; не публиковать `.env`, service-role ключи, пароли, cookies или токены. `VITE_SUPABASE_PROJECT_ID` используется MCP-интеграцией, первые два значения — основным клиентом и прямыми API-запросами. Переменные `VITE_*` встраиваются при сборке: изменение environment уже запущенного Nginx их не заменяет.

Для неизменного локального `.env` fingerprint можно получить `Get-FileHash -Algorithm SHA256 -LiteralPath .env`. Если значения переопределялись environment shell или файлами mode, нужен fingerprint согласованного полного набора effective public settings; один SHA `.env` тогда недостаточен. Проверить фактический backend URL и ключ в собранном JS/Network локального preview, не печатая значение ключа. Смена frontend-хостинга не должна менять destination API или требования к его proxy buffers.

## Пакет: сначала dry-run

```powershell
node deploy/nginx/package.mjs --dist dist --out D:/Codex/work/sintagma-nginx-20261001/deploy/nginx/artifacts --release RELEASE_ID --expected-commit FULL_BUILD_COMMIT --public-settings-sha256 VERIFIED_SETTINGS_SHA256
# После проверки вывода повторить ту же команду с --write.
```

Без `--write` файловые изменения отсутствуют. Пакет создаёт `RELEASE_ID.tar.gz`, `.tar.gz.sha256`, `.manifest.json` и сохраняет staging-копию в `stage-RELEASE_ID`. `dist` не меняется. Существующие release/stage/archive не перезаписываются. Gzip sidecars создаются для HTML/JS/CSS/JSON/SVG/XML/текста/manifest/WASM; manifest содержит SHA256 и размер каждого оригинала и sidecar. Archive checksum проверяется отдельно. Стадии и локальные QA fixtures исключены из Git, готовые archive/manifest/checksum можно передавать через отдельно согласованный канал.

При доставке из GitHub использовать публично проверенный репозиторий и **зафиксированный полный delivery commit**, а не движущийся branch URL. Скачать архив, checksum, `deploy.py` и три `.conf.template` из одного delivery commit. Commit доставки отличается от `source.gitCommit` внутри манифеста: последний описывает исходники frontend. Не встраивать access key в URL или shell history. Проверка SHA256 показывает совпадение с доставленным checksum; доверие к источнику обеспечивает проверенный delivery commit.

## Отдельный localhost preview на Linux

Требуются Python >= 3.9, Nginx с `http_gzip_static_module` и стандартный `mime.types`; Node на сервере не требуется. Сначала прочитать `nginx -V` и существующий `nginx -T`, сохранить исходный конфиг в согласованном месте. Production server/API/upstreams/buffers не заменять preview-конфигом. Пример operator-controlled настроек:

```json
{
  "deploymentRoot": "/srv/sintagma-preview",
  "allowedRoots": ["/srv/sintagma-preview"],
  "nginxBinary": "/usr/sbin/nginx",
  "nginxConfig": "/srv/sintagma-preview/nginx-preview.conf",
  "reloadCommand": ["/usr/sbin/nginx", "-c", "/srv/sintagma-preview/nginx-preview.conf", "-s", "reload"],
  "mimeTypes": "/etc/nginx/mime.types"
}
```

Корень обязан точно совпадать с одним allowlisted root. Settings-файл редактирует оператор; архив не может расширить allowlist или задать команды. Скрипты отвергают traversal, absolute/Windows archive paths, links, devices, duplicate/unlisted files, несовпадающие sizes/digests и превышение лимита 2 GiB. Права из tar не используются.

```bash
python3 deploy.py render --settings preview-settings.json --mode preview > /srv/sintagma-preview/nginx-preview.conf
python3 deploy.py deploy --settings preview-settings.json --archive RELEASE_ID.tar.gz --sha256-file RELEASE_ID.tar.gz.sha256
```

До redirection создать только согласованный preview root и его `run`/`logs` (`mkdir -p /srv/sintagma-preview/run /srv/sintagma-preview/logs`). Обе команды выше не переключают сайт. После проверки rendered config выполнить реальный `nginx -t -c /srv/sintagma-preview/nginx-preview.conf`. Для первого запуска preview стартовать этот отдельный Nginx `nginx -c /srv/sintagma-preview/nginx-preview.conf`; при пустом current до staging ожидается отсутствие сайта. Затем:

```bash
python3 deploy.py deploy --settings preview-settings.json --archive RELEASE_ID.tar.gz --sha256-file RELEASE_ID.tar.gz.sha256 --apply
```

`--apply` работает на Linux: до изменений делает `nginx -t`, проверяет и извлекает архив в новый release, сохраняет immutable assets, атомарно заменяет symlink `current`, повторяет `nginx -t`, затем reload. Если проверка/reload после переключения падает, скрипт возвращает предыдущий current и повторяет проверку/reload прежней версии. Если прежней версии нет, удаляется только новый current symlink; архив и release остаются. Отдельную ошибку rollback reload нельзя выдавать за успешный откат сервиса.

Не выполнять `systemctl reload nginx` с localhost preview settings: это относится к основному системному instance. Проверить фактический PID preview и конфигурацию перед командой. Существующий production Nginx остаётся самостоятельной целью.

Шаблон preview задаёт `user www-data;` для существующего Debian/Ubuntu сервера. Перед запуском сверить пользователя с директивой `user` системного Nginx и наличием учётной записи. Два экземпляра используют скомпилированные временные каталоги Nginx; запуск preview от другого пользователя может изменить владельца общего каталога и вызвать `Permission denied` при передаче больших ответов через системный reverse proxy. При другом системном пользователе адаптировать preview к фактической конфигурации сервера до запуска. Не исправлять это рекурсивным `chmod` или расширением доступа для всех пользователей.

## Проверка HTTP и откат

После локального `--apply` проверить `/`, вложенный SPA route, текущие entry JS/CSS, `sw.js`, `manifest.webmanifest`, один PDF/download и несуществующий `.js` (404, не HTML). Запрос с `Accept-Encoding: gzip` должен вернуть `Content-Encoding: gzip` для JS/CSS/HTML. Только `/assets/*-HASH.ext` и `/workbox-HASH.js` получают `max-age=31536000, immutable`; HTML, SW, регистрация SW и manifest обновляются без долгого HTTP cache.

```bash
curl -I http://127.0.0.1:8088/
curl -I -H 'Accept-Encoding: gzip' http://127.0.0.1:8088/assets/ACTUAL_HASHED_CHUNK.js
curl -I http://127.0.0.1:8088/sw.js
curl -I http://127.0.0.1:8088/assets/missing-file.js
python3 deploy.py rollback --settings preview-settings.json --release PREVIOUS_RELEASE_ID
# После проверки dry-run:
python3 deploy.py rollback --settings preview-settings.json --release PREVIOUS_RELEASE_ID --apply
```

Assets из новых и прежних пакетов сохраняются в `asset-history`, поэтому старые вкладки/PWA могут запросить старые chunks. Same-name/different-bytes collision блокирует выпуск. Предыдущие releases, history и незавершённые staging каталоги автоматически не удаляются. До первого переключения с другого механизма публикации добавить assets **именно действующей старой сборки** как отдельный проверенный retained release; наличие только новых assets не обеспечивает поддержку старого PWA.

## Production TLS — отдельный этап

`python3 deploy.py render --settings APPROVED_SETTINGS.json --mode production` печатает шаблон с placeholders `__SERVER_NAME__`, `__TLS_CERTIFICATE__`, `__TLS_PRIVATE_KEY__`. Он не устанавливается скриптом. Использовать существующие certificate paths/TLS/security directives, API host/locations/upstreams и proxy buffers по исходному `nginx -T`. После ручного согласования итогового конфига: backup действующего конфига, реальный `nginx -t`, согласованная установка/reload с откатом и проверка реального HTTPS-домена, версии, assets, SPA navigation/reload и downloads. Localhost PASS не подтверждает публикацию на домене.

Локальная проверка validators: `python3 -B deploy/nginx/test_deploy.py`. Она тестирует архивы, safe paths, checksum, staging/history, config render и rollback на искусственно вызванной ошибке reload; не подменяет реальный `nginx -t` и проверку сервера.
