# S-030: group loading recovery, 29 September 2026

The working site showed 79 learners in the group card and 0 inside because the API Nginx proxy rejected an upstream response header. Production data contained all 79 active members; RLS verified the organization owner's access.

At 12:31:50 UTC the existing API server received a minimal proxy buffer adjustment after a backup and successful nginx -t. A graceful reload restored the live group to 79 visible members. Evidence: D:/Codex/work/sintagma-queue/reports/2026-09-29-sgt-proxy-recovery.md. No learner data changed.

Source commit 281f465dbf1a0c3eba3acec223ac30fcc0a2fc59 also distinguishes load errors from empty groups, provides retry, paginates member loading and separates active/archived counts. It was merged with released main72b1db9 in d6b7c13b0. 19 targeted tests passed. Integrated Vite production build passed in 1m22s; log D:/Codex/work/sintagma-queue/work/s030-production-build.log. Publication of this UI resilience change is checked separately in the queue and roadmap after push.

The prior S029 photo setting is now visible on the real domain, off by default; camera/upload/learner smoke remains pending. This release only updates its checkpoint metadata.
