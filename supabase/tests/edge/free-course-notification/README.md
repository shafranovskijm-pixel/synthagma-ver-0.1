# Free-course notification B candidate — source only

Base main: 3fd1fcd4fc5fd770fce60d64440f1177fdb16b25 (PR157).

Selected production change: supabase/functions/notify-course-order/index.ts only. Authorization and claim helper are reference copies byte-identical to the base; no auth, ACL, purchase SQL, programme notifications, recipient configuration or credentials change.

The handler no longer returns early for NULL seller or an empty seller-email list. NULL sellers are already permitted only for the verified platform source by the unchanged authorization helper. Non-NULL sellers keep the same seller-org profile email recipients. Telegram keeps only TELEGRAM_SUPPORT_CHAT_ID; client-supplied fields cannot select recipients or override DB facts. Telegram is attempted before SMTP sends. Seller-recipient DB errors skip email and emit only the closed smtp_delivery_failed event; the already-authorized fixed Telegram is still attempted. A seller-org lookup failure uses the neutral label «Организация продавца» and skips profile lookup. Authentication and order-fact lookup errors remain fail-closed.

Zero-price fulfilled orders are worded as free course delivery; the legacy paid/completed status and valid paid_at are still required as a fulfillment receipt, not proof of bank payment. HTML escaping, canonical platform link, original purchaser token, active/revocation/blocked checks, original-caller courses.write, and delivered-copy/source/listing ownership remain unchanged. Raw transport errors are no longer logged from the Telegram or outer catch.

## Tests prepared, NOT EXECUTED

25 ordinary Vitest cases execute the actual handler and actual authorization/claim/access code, with explicit offline HTTP serve, SDK database and SMTP ports. Fetch is stubbed; no provider SDK/network/Telegram/email is used. Includes NULL seller, empty email list, paid customer compatibility, forged DTO fields, exact hashed duplicate claim, SMTP failure ordering, closed Telegram logging, configuration absence, all principal auth/delivery/ownership denials, the consumed-failure limitation, seller/profile query failures, actual newline serialization, and simple free-course email wording.

From a repository checkout with existing development dependencies:

    npx vitest run --config supabase/tests/edge/free-course-notification/vitest.config.mjs

No test, build, DB call, Git write, deploy, real email or Telegram request was executed for this source candidate. Candidate folder does not bundle dependencies.

## Deduplication limit

Existing claim_notification_dedup(text) atomically INSERTs a unique key before attempting delivery. It guarantees at most one claimed attempt per order/channel/recipient, not delivery. A process crash or network failure after claim consumes that attempt; the existing response success field is processing compatibility, not a Telegram receipt. Actual SQL source semantics were read by the SQL owner. No exactly-once claim and no automatic retry/outbox were added.

If reliable eventual retry is a release requirement, a separate minimal private outbox should be recorded transactionally when the course is granted, unique on order/channel/recipient hash; service worker claims a short lease, records acknowledged message_id and closed status, and retries known failures. Ambiguous network outcomes cannot guarantee exactly-once delivery because Telegram sendMessage has no caller idempotency key. Recipient/token/payload selection must stay server-side and original order authorization preserved. This is a follow-up proposal, not an implemented or activated dependency.

## B delta and separator evidence

A is preserved unchanged. B modifies seller email lookup failure handling, removes payment implementation disclaimers from end-user email/Telegram, and adds targeted cases (25 total). The original separator source already contains a single JavaScript escape \n (UTF8 codepoints34,92,110,34): it produces a newline, not a literal backslash-n. No separator product change was needed; N24 checks the parsed outgoing Telegram JSON string for an actual newline and absence of literal backslash-n.
