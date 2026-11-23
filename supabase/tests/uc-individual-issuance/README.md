# One new individual issuance native case

Run from the repository with Node 24.22.3, installed lockfile dependencies, and Docker supporting the pinned Linux PostgreSQL 17.11 image.

```sh
node supabase/tests/uc-individual-issuance/prepare-only.cjs
node supabase/tests/uc-individual-issuance/run-native.cjs
```

The runner creates one owned disposable container, binds only loopback, registers only W2FULL, and removes only that exact owned container. Output defaults to this package's outputs directory; CI should set W2_NATIVE_ARTIFACTS=outputs/uc-individual-issuance-native. W2_PREPARE_ARTIFACTS selects source preparation output. W2_CURRENT_REPO optionally names the current checkout.

The unchanged sibling uc-issued-recipient package is used only as a finite input materializer. Its old B1 test is hash-checked and removed before registration. No old W1/B1/readiness test runs. The accepted W1 R5 prerequisite is installed in a fresh local database, checked against its metadata, and stamped with an explicitly synthetic local ledger row only after that proof. This is not provider migration history.

The source pins require W2 R6 1ca952d2a2a3976f3ace70c8747f176c71e3707bbcc16072d9cbb40377a30831 (389267 bytes), actual accepted metadata 9aa11599f515f85b2f5e8cea73072049d92617876f3b4d97a4edd1adb5b0d51e, and the immutable B1 materializer. Only explicitly pinned UTF-8 EOL representations are accepted; other changes fail.

W2FULL exercises three synthetic programme kinds through actual W1 legal orders, canonical UC013 sealed evidence and explicit reviews, reviewed final protocols, the canonical UC019 PDF/stage/output/issue chain, genuine stored B1 proof, learner account confirmation and staff receipt. It also checks actual two-session privacy contention, replay/source changes, legacy isolation, billing and revocation fail-closed behavior, and exact original data and staff-right preservation.

Auth/Storage/render transport is a synthetic local adapter with an owned valid PDF and byte map. PostgreSQL functions, guards, stored proof and confirmation events are real. This does not attest hosted Auth, remote Storage HTTP, Browserless, actual customer educational evidence, XML exports, or production UI. The held XML import aliases to the installed package; local resolution was 0.8.11, and no XML methods are used by this case.

Do not archive node_modules or fixture mirrors. CI should upload only native output JSON/logs, excluding any node_modules paths.
