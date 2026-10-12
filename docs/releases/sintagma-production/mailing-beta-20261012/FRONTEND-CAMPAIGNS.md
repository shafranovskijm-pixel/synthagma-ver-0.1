# Client workflow and campaign batching

The existing organization mailing workspace now exposes a clear setup path:
mailbox, warmup, contacts, campaign. Sender settings can be edited and senders
can be disabled. A blank custom provider is the default; batch import is explicitly
labelled for `mail.torgi.com.ru`. SMTP usernames follow the email until manually edited.

Loading failures have retry actions instead of appearing as missing configuration.
Changing organization cancels stale UI results. The legacy SMTP check reads the actual
`success` response field. An IMAP-less draft explains why it cannot yet be activated.

Ordinary campaigns using a selected organization sender process at most 25 recipients
per run. A confirmed daily-quota rejection can be retried once for its explicit remaining
allowance; unknown reservation results remain blocked for review. Existing durable claims
and per-recipient accounting remain authoritative. The A/B wait timer starts after the
final sample batch has durable results. Platform and legacy SMTP batching are unchanged.

The UI distinguishes started batches, exhausted quota, existing runs and uncertain
previous attempts. It no longer promises every paused campaign will finish within five
minutes. Campaign and sender loading errors are visible and retryable.

## Local checks at release preparation

- Final application TypeScript check: passed.
- Production build: passed in 2m 3s.
- Frontend mailing regression: 313 unique tests in 32 files; five obsolete source-contract
  assertions were updated, then the four affected files passed (65 tests). The original
  failed run remains recorded outside the repository.
- Campaign changes: 101 tests in six suites passed, plus Deno check for `run-email-campaign`.
  These overlap the frontend set; they are not added into a larger total.
- Sender UI/actions: 83 unique tests; the final changed sender suite passed 12/12.
- Backend fixture and six additional Edge endpoints: see README.md and validation files.

Release branch starts from `64fdbe026d5e18cc00f5f31bd3f889a0db92205f`.
Prepared GET revision for all seven changed Edge endpoints:
`s004-mailing-beta-20261012`. Publication and actual message delivery are separate gates.
