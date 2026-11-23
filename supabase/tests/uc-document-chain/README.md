# UC document-chain read model1400

This is an additive, read-only projection. It creates7new functions and a private schema. It does not replay earlier migrations, update official records, allocate numbers, create orders, sign, issue, deliver or notify.

Contract: src/lib/documentChain/contract.ts, frozen V1A. Public API: uc_read_document_chain(uuid,jsonb,jsonb). Organization/group/student scopes use the installed education-journal authority composition. Private enrollment and source fences are reused after authorization. Lists contain at most50enrollments, use enrollmentUUID keyset pagination and return total_count:null instead of invented counts. Individual source lookups pass enrollment_id into the existing helper before reading source details.

Admission/completion slots use only exact personal retained registry contexts. Membership or participant arrays alone never establish a learner-order relation. Admission draft metadata uses the existing projection. Staff can preview needs_information when not stale/disabled/registered; its status and missing facts remain visible. CRM folders are not silently bound to one course. Education slots distinguish controlled issuance, annulment and unverified legacy records.

source resolves an exact revision and version; journal_source resolves the specific canonical row ID/sourceID/revision rather than replacing it with the latest slot. Unsupported/non-document journal rows return unavailable with no invented source. Read operations never prepare a file. Targets contain references only; existing controlled APIs must recheck authority and exact file versions before returning bytes.

Own-student views are metadata only for these sources. Existing staff-only admission exports, full registry/group files and controlled staff downloaders are not borrowed. Missing individual extracts/downloads are reported explicitly. Completing that write/extract workflow remains a separate required package.

Isolated tests

- fixture.sql: synthetic tables plus19captured19Nov authority definitions, the actual old enrollment/source fences and admission source/projection functions. Billing holds, programme availability and file proof availability are explicit synthetic collaborators; no production/native identity proof is claimed.
- acceptance.sql:42distinct assertions for scope, tenant, actor, teacher, stale versions, historical journal sources, legacy/controlled/annulled state, safe draft preview, keyset paging and unchanged business rows.
- Native: run fixture, new1400migration, acceptance against a fresh isolated PostgreSQL17 database with ON_ERROR_STOP=1. Cluster roles anon/authenticated/service_role are created conditionally by the fixture/driver.
- Optional isolated runner: review/run-chain-isolated.cjs uses explicit local WASM. The first successful source-bound isolated PGlite run at 23Nov2026 09:21:41UTC passed all42assertions; receipt review/CHAIN_SQL1400_ISOLATED_RESULT.json. This is not native PostgreSQL or production acceptance. Earlier runtime failures happened before SQL parsing. The known SQL-source corruption caused by JavaScript replacement-string expansion was repaired before freeze; native compilation is mandatory.

No production SQL, old function patches, client data changes or migration installation were performed by this author.
