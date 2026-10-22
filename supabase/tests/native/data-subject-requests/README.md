# UC023 actual PostgreSQL acceptance

The two TypeScript files are byte-exact copies of the passing three-case native source. They extend the committed UC016 fixture, which extends the existing full-cycle and scoped-journal fixtures. The three captured JSON files contain schema/function metadata only.

Run through the owned PostgreSQL17 native adapter, not the default PGlite constructor. The bound profile contract is archived in `docs/uc023/native-evidence/NATIVE_CONTRACT.json`; the exact local frozen profile and actual result hashes are recorded in `SOURCE_CLOSURE.json`. The adapter changes only the existing constructor seam and uses genuine current authority functions, two actual PostgreSQL connections and normal trusted erasure jobs.

Actual verification: 3/3 cases passed, all16 strict checks passed, all1068 old/new source pins were unchanged, and owned Node/PostgreSQL cleanup passed. `docs/uc023/native-evidence/ACTUAL_COMBINED_NATIVE_V3_PASS.json` records the evidence and limits. This is native acceptance, not a production deployment claim.

The captured postappend catalog and its read-only collector SQL are archived next to the receipt for the guarded production release. No automatic data destruction is added to the product.
