# Guest chat, retention-source impact and publication diagnostics

Guest support calls now explicitly omit a user bearer while retaining the existing guest conversation capability. Signed-in calls keep their original SDK bearer; invalid sessions never fall back to guest access. Widget layout, actor transitions and request bodies are preserved.

Normative change impact now also follows retention.sourceId in requirement payloads, including removed requirements. Migration 20261026010000 replaces only the existing read_normative_governance function body. Manifest hashes, sourceIds, prior decisions, legal-review/publication/acceptance flags, customer data and function authority are preserved. Guarded production dry-run and independent rollback readback passed on ledger633; the committed migration must be applied and independently verified by the release operator.

Publication accessibility logs only a closed set of static guard reasons. The existing SSRF, DNS, TLS, redirect, size and timing checks remain unchanged. The initial QA check was unsafe_target; its actual guard cause remains unconfirmed until a new normal check after this deployment.

Kinescope and course-completion responses project only allowed fields. Support forum topic names no longer include customer contact fields; intended operator messages retain their existing purpose.

Validation: guest30 passed (18 source/CJS/ESM SDK cases, 3 header-helper cases, 9 real widget cases); response/topic17 passed; publication41 passed plus one five-source API bundle build; retention8 frontend cases and4 native facts/16 assertions passed. A single stock TypeScript5.8.3 whole-app check passed:5120 files, zero diagnostics. SDK source constructor, real AI/messages/purchases and a complete working-site roadmap acceptance are not claimed by these local checks.

Release from main57d283434f34631b83ea06c09e7891d24b49f6d8. Deploy only the changed kinescope-proxy, notify-course-completion, support-chat and publication-accessibility functions after exact-source verification. Preserve config/JWT settings. FRDO generation failure diagnosis and the original-purchaser order-notification fix remain separate work.
