# Private course document previews

Five existing automatic preview callers now use the existing courseDocumentPreview policy. Only validated public course-files objects on the configured platform can reach Office or the learner's 8-second Google fallback. Signed/private/unknown sources use a sandboxed native PDF, available local slide content, or the existing direct download/open path. No customer data or storage permissions change.

The course manager uses its existing user-scoped course_documents read and rejects stale course responses. CoursePreview retains allow_materials_download=false. Learner SliderLessonViewer and BlockRenderer already expose download without an allowDownload prop; this release preserves that existing boundary and adds no parent permission wiring. FilePreviewDialog's existing direct Open fallback is unchanged.

Ordinary regression command (existing project dependencies, no install):

    node node_modules/vitest/vitest.mjs run --config tests/course-viewer-privacy/vitest.config.mjs --configLoader native --maxWorkers=1 --no-file-parallelism

The actual development-worker run used Node24 and its worker configuration. The portable repository config is pure .mjs for the project Node20.19+ environment; only relative root/@ paths changed and the portable layout was not separately executed.

25 actual cases passed: 23 privacy/scope/transition cases plus two existing memoization cases. Tests mount the five real React components and the existing policy/FilePreviewDialog, using explicit offline SDK/view-model/visual ports. They assert zero fetch and zero mutation/storage effects. The first attempt stopped before any case because Vitest disallows a directly exported vi.hoisted declaration; the corrected export keeps the same port identity and all product/assertion bytes. Earlier 24-case envelopes were never run.

Whole-app stock TypeScript passed on 5139 files with zero diagnostics, natural exit0 in95.424seconds and fresh owned-process EMPTY. The compiler source excludes the three not-yet-released archive637 changes and includes the exact published146 generated types. No local frontend bundle or browser/private-PPT/vendor probe is claimed. Production deployment and real working-site acceptance belong to the release owner.
