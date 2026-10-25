# Six native functions: database 632 release packaging

This folder records local packaging, not native deployment, working-site acceptance, legal approval or centre acceptance. The database migration and its independent acceptance are tracked separately by the release owner.

## Source layout

Each of the six function folders contains an editable `runtime-source.ts`, the byte-exact original entry source; a generated `runtime.bundle.js`; and a thin `index.ts` that imports only `./runtime.bundle.js`. The retained original source continues to import its normal sibling/shared modules. Editing source does not regenerate the bundle automatically. Do not edit the minified runtime as canonical source.

`DEPLOYMENT_MAPPING.json` binds the retained source, thin entry and runtime hashes. The six `bundle-source-manifest.json` files and global manifest/metafile here are verbatim output of the original frozen build. In those original manifests, output `index.ts` denotes the generated build artifact; its bytes were copied unchanged to `runtime.bundle.js`. It does not denote the new thin entry. No duplicate bundle payload is stored in this docs folder.

## Provenance and exact preimages

The reviewed current PR 128 source head is `61255190c94491b7fc99aa74867e76ac5dbddf56`, tree `8166bb524e0057917912b9d39f6c4f3a2cd5b07a`. Root proof `work/resume-20261025/ACTUAL_PR128_J_AMEND_EXACT_TREE.json` (SHA-256 `0bb7b89ff4de57b0b8fc23a9935a2242a3b2d0093b6586f82e00a77afad684e7`) records that only the canonical migration blob changed from the earlier reviewed union144 draft; all other 4,288 blobs/modes were exact. This identifies source preimages, not deployed code.

The six current source entries retained byte-for-byte are:

- `archive-case-package`: 1956 bytes; SHA-256 `17b99823fda60b40d583fa441bdad5fcd6ae7eaece0f3804153f8c5b8c252e5f`; Git blob `12f12eae6a1a52803910210b2248588a97fc645e`.
- `archive-case-read`: 1077 bytes; SHA-256 `51491bdd4af7e7b47b1049f0fde6bd77e475b086ab002d47848a20b5209c7f6d`; Git blob `0ed1c0a0a974e79a9b3ab434fe1d9d274d20d1e0`.
- `archive-case-restore`: 1089 bytes; SHA-256 `645d8b28765b735316d3301fdb030786e02aa9705a9b011977dab3805c945e3f`; Git blob `032b1d66ac7350956823bbc4d14072a7cd0fa2b2`.
- `archive-rule-source-check`: 1089 bytes; SHA-256 `0ec3036a999d524720ed2b69a0c9ebf6f3ade948632ad1ab00676a4035911753`; Git blob `f9dfeb142565e73e008e83f57081499f5d6f108f`.
- `generate-self-examination-report`: 3795 bytes; SHA-256 `372b1179eb6c9bf7992eeea8117adab7759d9e30b2a5762327200eadee4c1175`; Git blob `636b82813ee37718b3e25d03175251cd766300c4`.
- `publication-accessibility`: 1891 bytes; SHA-256 `a0690e8551b95563fb42b369d16b676ade96979ededcec7b3b75a6988494502c`; Git blob `ffdc9a371de598153b98c4f210302468dc9612e3`.

The separate base/restored PR 127 commit is `af3a68d03100006e806cb625f28befae28b3c441`. It is not interchangeable with the six PR 128 preimages above. The 28-path source packet records both the current entry preimages and any older base blob separately.

## Rebuild contract

One held build used esbuild 0.25.12, Node v24.19.0, stock `tsconfig.json`, ESM/browser/ES2022, bundle/minify enabled, UTF-8, source maps off, legal comments at EOF and exact installed Zod 3.25.76. Global closure was 36 local TypeScript modules plus 10 Zod ESM files, 46 exact metafile inputs. Its six generated artifacts total 410,986 bytes. There was one build call; release mapping made byte copies and no second build.

A future source change requires a fresh finite source/runtime hold and a new build from the edited `runtime-source.ts` plus its complete current shared/import closure, then a matching bundle and new manifest. The original consumed one-run plan intentionally refuses existing output folders; it is evidence, not a reusable command for the new thin entries. Do not bundle the thin entries as a substitute for rebuilding canonical source. Do not reuse old hashes after edits.

## External dependencies, authentication and acceptance

The exact remote imports remain external: `npm:@supabase/supabase-js@2.90.1` for the four archive functions and publication accessibility; `https://deno.land/std@0.168.0/http/server.ts` and existing `https://esm.sh/@supabase/supabase-js@2` for self-examination. They were not fetched or executed by local packaging. Native provider resolution and real authenticated calls must be checked after deployment. No SDK version was silently changed.

The explicit deployment choice is `verify_jwt=true` for the five new functions, preserving their current configuration default, and existing `verify_jwt=false` for `generate-self-examination-report`. The source `supabase/config.toml` is unchanged. Gateway anonymous 401 does not prove the handler version or authenticated acceptance. Keep the handlers own role/tenant checks and diagnose any real JWT failure before changing gateway settings.

Local build receipt: `actual-build-six/result.json`, SHA-256 `18dfd600cc9d7fbbc006e87c3927d96362fa956e619a9a3ed2c39268deee3d27`: one Node PID 34820 exited naturally with code 0, final exact owned-process/children readback EMPTY, source/runtime drift empty, exact 14 build outputs. It is not native Deno/provider/live QA.
