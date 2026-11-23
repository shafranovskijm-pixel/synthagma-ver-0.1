# One new individual issuance native case

Run from the repository with Node 24.22.3, installed lockfile dependencies, and Docker supporting the pinned Linux PostgreSQL 17.11 image.

```sh
node supabase/tests/uc-individual-issuance/prepare-only.cjs
node supabase/tests/uc-individual-issuance/run-native.cjs
```

The runner creates one owned disposable container, binds only loopback, registers only W2FULL, and removes only that exact owned container. Output defaults to this package's outputs directory; CI should set W2_NATIVE_ARTIFACTS=outputs/uc-individual-issuance-native. W2_PREPARE_ARTIFACTS selects source preparation output. W2_CURRENT_REPO optionally names the current checkout.

The unchanged sibling uc-issued-recipient package is used only as a finite input materializer. Its old B1 test is hash-checked and removed before registration. No old W1/B1/readiness test runs. The accepted W1 R5 prerequisite is installed in a fresh local database, checked against its metadata, and stamped with an explicitly synthetic local ledger row only after that proof. This is not provider migration history.

The current source pins require W2 R7 53e64aad6ccba72ee755095fd55cb176159f975b36cca508ffa70e27006fa757 (390227 bytes) and the immutable B1 materializer. The byte-exact historical metadata 9aa11599f515f85b2f5e8cea73072049d92617876f3b4d97a4edd1adb5b0d51e remains an actual R6 /1ca952d2 reference; only its eight unchanged new-schema logical vectors are compared. Required exact-head CI captures fresh actual R7 metadata. Only explicitly pinned UTF-8 EOL representations are accepted; other changes fail.

W2FULL exercises three synthetic programme kinds through actual W1 legal orders, canonical UC013 sealed evidence and explicit reviews, reviewed final protocols, the canonical UC019 PDF/stage/output/issue chain, genuine stored B1 proof, learner account confirmation and staff receipt. It also checks actual two-session privacy contention, replay/source changes, legacy isolation, billing and revocation fail-closed behavior, and exact original data and staff-right preservation.

Auth/Storage/render transport is a synthetic local adapter with an owned valid PDF and byte map. PostgreSQL functions, guards, stored proof and confirmation events are real. This does not attest hosted Auth, remote Storage HTTP, Browserless, actual customer educational evidence, XML exports, or production UI. The held XML import aliases to the installed package; local resolution was 0.8.11, and no XML methods are used by this case.

Do not archive node_modules or fixture mirrors. CI should upload only native output JSON/logs, excluding any node_modules paths.

The current R7 derivative is authorized for the required new exact-head CI. Do not rerun the already accepted local three-kind case solely for this package update. R7 checks both legacy detail and list duplicate capabilities are false for the genuine private issued record, while a separately created ordinary grouped record keeps its original strict DTO and enabled duplicate capability.
