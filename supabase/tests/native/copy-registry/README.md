# Actual UC016 PostgreSQL regression sources

These seven cases exercise the real registry RPCs, exact migrations and two independent PostgreSQL sessions. They are not an interchangeable PGlite or mocked-permission suite. The existing repository fixture helpers and migrations 615/617 are used by relative imports and paths; SOURCE_CLOSURE.json records the added accepted fixture origins and hashes.

Required execution environment: PostgreSQL17, a real connection adapter exposing exec/query/native.connect, Node20.20.2, Vitest, the repository aliases and Zod schema, one isolated database per case, UTC, and an owned lifecycle that closes both Node and PG after failures. The accepted source seam replaces only the foundational fixture PGlite constructor with the real PG adapter. It does not rewrite authority predicates, remove migration guards, fabricate the ledger, or weaken assertions. Accepted baseline is615+exact617;616 HTTP-only boundary wrapping was checked separately in production, not faked in this fixture.

The reviewed runner is an external workspace evidence artifact because it contains machine-specific lifecycle/provenance pins; it is deliberately not committed together with runtime binaries, node_modules, copied DBs or generated profiles. Source cases and fixture are committed here so subsequent work can review and regenerate that bounded profile.

Current seven-case profile:
- workspace profile: work/uc016-server-registry-native-v6-20261022/profile
- manifest SHA-256: b8dac01f82d8b2e0c99b182a5ad9b8103e5b5f71e6a616163c3a0a18469b51ff
- immutable618 source: work/uc016-server-registry-evidence-20261022/backend-draft-v5-20261022.sql, SHA-2560fd7a0e3595a96cf7acec44e02fb83c155a702ab7f8346178032e091d050789e
- seven-case source SHA-256:9d1ecfb64c14f7de0a44af5acca5fe2f95a0cd658675e1d75694c5d936cc1538
- fixture SHA-256:bea7dd135ff7632ea7de71dacb41e0284c87382538fb7a4c403649bd1215e666
- actual strict client schema SHA-256:a364956737ec3abd4b6c2dadd23729afb91d6d980f7ae8f92f32d514c98b5cd6

From the task workspace on the reviewed Windows host, the exact invocation is:

~~~powershell
C:\Python314\python.exe -B -X utf8 work\uc016-server-registry-native-v6-20261022\profile\run-scoped-journals-linux.py --run-reviewed-linux-scoped-journals --manifest-sha256=b8dac01f82d8b2e0c99b182a5ad9b8103e5b5f71e6a616163c3a0a18469b51ff
~~~

Do not transplant the Windows path to another machine without locating its workspace/runtime. A new host needs a freshly reviewed source/lifecycle profile; the test assertions remain the same. The runner supplies UC116_NATIVE_PROFILE (directory containing profile-contract.json), UC116_NATIVE_OUTPUT (bounded artifact directory) and its native PG adapter configuration. It pins the exact client module at src/lib/copyRegistry/contract.ts, so actual RPC results pass the same strict schemas as the UI. Generic npm test does not claim these concurrent native cases.

Artifacts are copy-registry-cases.json, vitest.json, native-adapter.json, uc016-post-append-native-metadata.json, lifecycle and source-pin verification, plus result.json with separate test and owned-resource cleanup outcomes. Failed attempts are retained; no failure is relabelled as a pass. Runtime acceptance and production release state are maintained separately in the task evidence and roadmap.
