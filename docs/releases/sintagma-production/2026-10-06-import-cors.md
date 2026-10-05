# S-040 — learner import CORS repair

Yana's 5 October report shows 15 importable rows blocked by the registration
revision check. A read-only GET confirms that both the direct backend and the
production proxy return HTTP 400 and `student-import-v6`. The production proxy
does not include `x-sintagma-register-student-revision` in
`Access-Control-Expose-Headers`, so browser fetch cannot read that header.

The repository's Nginx template now exposes the registration revision on error
responses as well as successful responses. The existing import guard and all
duplicate checks remain in place. No database or Edge Function change is needed.

## Server application

On the existing Timeweb VPS, inspect the live configuration, then run the
reviewed `deploy/nginx/patch-student-import-cors.py` first without arguments.
After checking the one-header diff, run it with `--apply`. The script refuses
unexpected configurations, saves a backup, runs `nginx -t`, and reloads system
Nginx. Failure restores the original configuration. This does not deploy the
separate frontend preview or change DNS.

## Verification

- 11 focused Vitest tests passed: proxy CORS contract and import fail-closed gate.
- 7 Python helper tests passed, including ambiguous configuration refusal and
  idempotence.
- Server application and authenticated browser import remain pending at the
  time this change was prepared. A source merge alone does not repair Nginx.
- After application: verify the revision is exposed on the proxy's HTTP 400,
  then run the learner import on designated technical records in the real UI.

Private mailbox evidence and operational receipts are stored outside Git at
`D:/Codex/work/sintagma-queue/work/sgt-import-20261006/`.
