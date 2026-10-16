# Payment, access, interface and postpaid release — 2026-10-16

Prepared and tested locally; **not deployed**. This is one explicit eleven-migration package based on `a122066363461d9beb5247476dd26c89aef16040`. It fixes payment settlement, authorization and interface persistence, and adds opt-in contract-based monthly postpayment. Applying it does not enroll an organization, invent historical usage, issue an invoice, charge a customer or change an organization's tariff.

## Exact migration order

| Order | Migration | Purpose |
|---|---|---|
| 1 | `20260822164000_atomic_tbank_balance_credit.sql` | Explicit missing live prerequisite: keyed ledger and atomic balance credit |
| 2 | `20261016023000_create_org_user.sql` | Finalize signup-created profile and role atomically |
| 3 | `20261016024000_org_theme_patch.sql` | Merge only the authorized organization theme subtree |
| 4 | `20261016110000_atomic_payment_settlement.sql` | Atomic payment/access settlement, replay protection and invoice guard |
| 5 | `20261016140000_legacy_crm_access.sql` | Scope legacy CRM access and assignees; preserve legitimate platform sales |
| 6 | `20261016150000_skillspace_job_authorization.sql` | Verify import-job authorization; quarantine historical unverified jobs |
| 7 | `20261016160000_postpaid_billing.sql` | Agreements, immutable usage, reviewed monthly calculation, invoice issuance and access profile |
| 8 | `20261016161000_manual_invoice_settlement.sql` | Atomic manual settlement; postpaid closes debt without future access grant |
| 9 | `20261016162000_postpaid_access.sql` | Allow admission while counting use; require confirmed CRM consent under active postpaid agreements |
| 10 | `20261016163000_secure_billing_scheduler.sql` | Private Vault authorization for the existing daily billing job |
| 11 | `20261016164000_postpaid_bank_guard.sql` | Route a legacy prepaid bank payment received after postpaid activation to review |

`release-manifest.json` contains exact migration source/executable checksums, the batch hash, Edge entrypoints and the transitive local handler/shared import inventory, including expiry scheduling. Hashes normalize CRLF to LF only. `prepare-release.mjs` reads only these named migrations and inventories their code dependencies; it does not connect to a database or deploy anything. Regenerate after any source change and rerun the release test. The separately built frontend must also match the reviewed checkout.

## Transaction and preservation

Review and eventually submit **all of `release-transaction.sql` as one SQL-editor request**. It takes release and migration-ledger locks, checks prerequisites, verifies every source and executable body, applies eleven migrations, records each exact original source in `schema_migrations`, and checks postconditions and preservation before COMMIT. An already-recorded version or unknown canonical function refuses the whole package. Do not skip fragments or replay selected historical migrations.

The wrapper uses REPEATABLE READ. The generator strips only reviewed outer transaction boundaries: plain BEGIN/COMMIT or the scheduler's exact `BEGIN ISOLATION LEVEL REPEATABLE READ;`. Full original source remains in the ledger. Late failure rolls back earlier schema changes, the billing job edit and the new Vault record. Lock timeout is five seconds; statement timeout is 120 seconds.

Hosted `postgres` has no direct UPDATE/LOCK permission on `cron.job`. Before preservation checks, the release locks only its owned daily billing job through `cron.alter_job(jobid, active := current_active)`, then verifies the entire row is unchanged. REPEATABLE READ makes an intervening update fail rather than overwrite it. Cron and Vault tables are excluded from direct table locks; Vault creation uses its supported API and unique secret name. No extension ACL grants are added.

Internal checksums compare organization, profile, invoice, payment, ledger, CRM, import, learning and usage records, excluding only deliberately added identity/billing columns and the import marker. Existing deletion policies, unchanged canonical access helpers, quota/CRM function ownership and ACL attributes, unrelated jobs and unrelated Vault records must remain unchanged. No credentials or personal rows are returned. The billing command change is checked separately; its schedule and other metadata are preserved.

`postcheck.sql` is an **installation-time check**: agreements, events and new settlement tables must be empty, and historical import markers must remain NULL. Run it before enrollment and import resumption. Once legitimate new data exists, use scoped operational checks instead of these emptiness assertions.

## Deployment sequence

1. Confirm the intended project, retain the normal schema/definition backup and inspect permissions. Run read-only preflight diagnostics. All eleven versions must be absent. Canonical quota functions, the CRM access gate and the existing scheduler must match the reviewed originals. Do not separately install the embedded ledger prerequisite.
2. Pause new SkillSpace batches and drain/stop the old recursive worker. Deploy the hardened batch handler and shared dependencies **before SQL**; it fails closed while the verification column is missing. Keep imports paused.
3. Submit the complete transaction. Match its eleven returned versions and MD5s to the manifest. On error, roll back and review the drift; do not continue fragments.
4. After SQL, deploy remaining hardened Edge functions and all inventoried local imports. Payment order is webhook, subscription Init, then course Init. Deploy organization creation, conversion, certificate, media migration, parsing and reimport handlers. **Secure scheduler SQL must precede `check-subscription-expiry` deployment**: the old anon bearer is only a gateway credential; the new private Vault header supplies business authorization. Cron fetches that secret at runtime; its value is absent from the stored command.
5. Deploy the reviewed frontend, including theme/preview fixes, postpaid review UI, lesson interaction instrumentation, access limits and manual invoice confirmation. Run staging checks and scoped live checks. Reconcile historical import jobs explicitly; NULL markers must not be auto-resumed. Historical paid bank documents without keyed ledger require reconciliation instead of another credit.

## Postpaid operation

Enrollment is a separate administrator action requiring a contract reference and customer agreement evidence. The implemented `59-09/26` terms select one cheapest sufficient monthly tier (4490 / 6990 / 16990), using distinct courses and learners who actually studied. Feature floors require actual use and prior customer confirmation. There are no AI/storage/completion pricing thresholds or annual discount. The contract runs through 31 December 2026 with annual renewal. First activation is restricted to a month's first day; early termination uses calendar-day proration. Additional services are excluded and require a separate written agreement.

Actual learner interactions create immutable events. Assignment, menu viewing, platform welcome instructions, scheduling a webinar and merely enabling a feature do not. Deletion/archive cannot erase captured use. Earlier periods remain incomplete historical evidence and require explicit reviewed counts. Offline activity and separately evidenced feature use always need attention during administrator review.

The daily job creates closed-month **drafts** and internal administrator notifications only. Approval and issuance each revalidate the snapshot; changed evidence requires a new revision. Issuance is idempotent. Invoice payment closes the receivable without extending `paid_until`. Active postpaid organizations cannot receive a new legacy prepaid invoice. A real old bank payment is recorded but routed to review without overwriting postpaid access.

## Local validation

`release-batch.test.ts` executes the actual generated transaction in fresh synthetic PGlite under a non-superuser with business-object ownership and hosted-style extension permissions: cron SELECT only, Vault SELECT/DELETE, and supported API execution. Direct cron UPDATE/LOCK is confirmed to fail. It checks success, dependency hashes, exact-source ledger content, replay refusal, full rollback on the eleventh ledger insert, late import drift, late scheduler drift, source tampering and missing prerequisites. The fixture composes existing release data, actual canonical quota functions and narrow synthetic Vault/cron APIs. Separate suites exercise calculation, immutable events, permissions, manual settlement, admission quotas, bank callbacks and scheduler authorization.

PGlite is not a multi-session PostgreSQL concurrency test; Vault/cron stubs do not validate hosted extension configuration. Use the reviewed live preflight and normal staging checks before deployment. Tests never contact a hosted database, perform real payments or load production secrets.
