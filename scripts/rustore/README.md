# Public RuStore availability for the landing page

This checks the public card at
`https://www.rustore.ru/catalog/app/ru.sintagma.app`. The official URL format is
documented in [RuStore Deeplinks](https://www.rustore.ru/help/sdk/rustore-deeplinks).
It does not change the RuStore account, submit releases, consume a paid API,
or bypass CAPTCHA. It needs only Python 3 from the existing Linux server.

`available: true` requires the exact public card and canonical URL, a real
installation link for the expected package, matching Android SoftwareApplication
metadata/name/version, and an InStock offer. An HTTP 200 alone is insufficient.
404/410 become `not_found`; redirects, login/challenge pages, network/TLS errors,
other HTTP errors and unrecognised markup become `unknown`. Both hide the link.
Every run atomically writes the current result, including failures; it never
keeps a previous successful value indefinitely.

## Deployment on the existing VPS

These commands are installation instructions, not proof of a completed server
deployment. Check that `/usr/bin/python3`, systemd and the `www-data` account
exist, and review the existing Nginx HTTPS virtual host before applying changes.
No database, authentication, storage or hosting migration is involved.

After transferring the reviewed script and unit files to a server staging
directory, run the following as root using actual paths for the three source
files. The script remains root-owned; the unprivileged job can write only its
public data directory.

```sh
install -d -o root -g root -m 0755 /opt/sintagma-mobile
install -m 0644 check_rustore_public.py /opt/sintagma-mobile/check_rustore_public.py
install -d -o www-data -g www-data -m 0755 /srv/sintagma-mobile
install -m 0644 sintagma-rustore-public-check.service /etc/systemd/system/sintagma-rustore-public-check.service
install -m 0644 sintagma-rustore-public-check.timer /etc/systemd/system/sintagma-rustore-public-check.timer
systemd-analyze verify /etc/systemd/system/sintagma-rustore-public-check.service /etc/systemd/system/sintagma-rustore-public-check.timer
systemctl daemon-reload
systemctl start sintagma-rustore-public-check.service
systemctl enable --now sintagma-rustore-public-check.timer
```

The explicit service start produces the first JSON immediately. The timer also
checks one minute after boot and every hour after the previous activation.
The process runs as `www-data`, with root-owned code, no home-directory access,
no new privileges, a read-only system, and only `/srv/sintagma-mobile` writable.
Its network access is ordinary outbound HTTPS. A server version that does not
support a hardening directive needs an explicit review rather than blindly
removing all isolation.

Verify both the generated JSON and the timer:

```sh
systemctl status --no-pager sintagma-rustore-public-check.service
systemctl list-timers --all sintagma-rustore-public-check.timer
cat /srv/sintagma-mobile/rustore-availability.json
```

An inactive oneshot after successful completion is normal. Verify its exit
status and fresh JSON; an active timer by itself does not establish success.

## Public JSON endpoint

The intended endpoint is
`https://api.xn--80aaiswd0ak.xn--p1ai/mobile/rustore-availability.json`.
Add an exact static-file location to the existing reviewed Nginx HTTPS server,
preserving its existing security, TLS, CORS and proxy settings. For example:

```nginx
location = /mobile/rustore-availability.json {
    alias /srv/sintagma-mobile/rustore-availability.json;
    default_type application/json;
    add_header Cache-Control "public, max-age=300" always;
    add_header Access-Control-Allow-Origin "https://xn--80aaiswd0ak.xn--p1ai" always;
}
```

Nginx `add_header` directives at a location affect inheritance. Preserve all
applicable existing response headers and avoid duplicate CORS headers when
integrating this example. Run `nginx -t` before a reload. Confirm actual HTTPS
JSON delivery, correct content type and CORS on the real domain afterwards.
No directory listing or generic writable-directory endpoint is needed.

The landing page must accept only the exact schema/version, package, public
card URL, `status: "available"`, `available: true`, and a `checkedAt` no older
than 24 hours. It can fetch every five minutes, while the VPS checks hourly.
Hide the button for stale/invalid JSON or fetch errors. The downloadable signed
APK is independent of this conditional RuStore link.

## Tests and observed format

```sh
python3 -m unittest -v test_rustore_public.py
```

Tests cover positive installation metadata, the observed RuStore relative CTA,
404 responses containing plausible app data, wrong app/package/canonical,
missing installation/action/stock status, login and bot pages, HTTP/network
failures, malformed or foreign metadata, and atomic replacement of old success
with unknown. `fixtures/published-card.sanitized.html` is a small extract of
public Госуслуги markup observed over HTTPS on 2026-10-08. It contains no user
reviews, personal names or credentials and is not evidence of SINTAGMA release.

If RuStore changes its markup, the probe returns unknown. Public availability
then needs inspection and a parser update, rather than an unverified link.
