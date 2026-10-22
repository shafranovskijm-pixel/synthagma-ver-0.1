# UC018 guarded release source620

The producer, readonly portable-catalog query and reviewed config are exact copies of the source-reviewed work bundle. Producer SHA3a9162f1f1dab65d954c873a611d9fb067ac0b1c2198c2691faf0e39a00c9912; query SHA5d8bddba45199bf986f2116aa865a3f8b9fe469a24bd1c73bd6cc687c2891144; config SHA70bca9c7eaa2e1e0974924e574d72cac15be5f3de8274dd1edb15c918364a2de. The producer imports its query relative to its own module URL; no installed package or database connection is used.

From the repository root, generate new source-only wrappers into a fresh directory using the existing supported Node runtime:

    node -e "import('./docs/releases/sintagma-production/uc-document-registry-20261022/prepare-guarded-release-v2.mjs').then(m => m.prepare('supabase/migrations/20261022230000_uc_document_registry.sql','docs/releases/sintagma-production/uc-document-registry-20261022/reviewed-config.json','work/uc018-release-source-reproduction'))).then(x => console.log(JSON.stringify(x)))"

Generation does not execute SQL. The config pins actual production619 policy preimage,374existing table rowsets/public339, ledger619, exact new34function/five-table semantic metadata and two reviewed privacy bodies. Rehearsal and commit outputs differ only by final ROLLBACK/COMMIT. All current data and old metadata/ACL/roles/ledger must remain identical within the wrapper, except the two exact function bodies and one existing legacy-read policy qual. A changed baseline refuses execution.

The native acceptance combines five actual V11 passes and two whole-case V13 passes with identical product SQL; the immutable V11 overall FAIL is retained. See supabase/tests/native/document-registry/README.md for hashes, runtime, command, exact coverage and independently retained-original boundary. Production trial/readback, commit and live acceptance are recorded separately; this directory is reproducible source, not proof that SQL was executed.
