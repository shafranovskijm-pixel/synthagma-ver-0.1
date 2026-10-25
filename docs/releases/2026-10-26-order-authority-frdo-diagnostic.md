# Authoritative course-order notifications and FRDO failure stages

Course-order notifications now require the active original purchaser and their current courses.write permission. The delivered course, listing, seller and buyer organization must match authoritative stored records. Recipient, totals, names and notes come from those records; forged request fields cannot choose a recipient or amount. Existing notification claims are used directly with strict boolean/error handling before each channel. A failed or ambiguous delivery remains claimed: at-most-one attempt is not a delivery guarantee or a retryable outbox.

FRDO generation records only a closed static stage and error category when an existing attempt fails. Original failure objects, original-user authorization, lease/CAS checks, workbook/size limits, upload/readback/sealing and historical attempts remain unchanged. Successful generation stays quiet; logging errors cannot replace the original error. No learner fields, identifiers, paths, exception text or stacks are logged.

Validation:32 whole notification-handler cases passed;12 paired FRDO service/HTTP behavior cases passed; one existing API bundle build passed with49 exact source rows and no external imports. Two earlier FRDO test-harness failures occurred before the target scenarios (missing alias closure, then cross-realm canonical objects); they remain failures and were corrected in the harness without changing product code or assertions.

The same QA packet still has its original failed attempt at revision3, with no new issuance. Its actual failure stage is unknown until this diagnostic is deployed and a normal new attempt is made. No SMTP, Telegram, purchase or FIS submission was performed during these checks.

Release on reviewed main58b8340406def2ce79379e2dfb909763e3eb19f7. Deploy frdo-packet-artifact alone because its complete function+shared raw source is4,494,826 B; deploy notify-course-order separately. Preserve config.toml6546 B, existing JWT flags and all database data. No migration or frontend source/config change is included.
