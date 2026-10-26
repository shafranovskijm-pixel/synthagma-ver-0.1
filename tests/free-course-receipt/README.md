# Own free course receipt refresh

The seven pure cases are unchanged from A; root reported their PASS. B adds two actual-hook cases, prepared and not executed by this author. Overlay this partial candidate on root's complete158/159 source. Use the existing runtime; install nothing.

```sh
node node_modules/vitest/vitest.mjs run --config tests/free-course-receipt/vitest.config.mjs
```

Run the two new integration cases separately with `tests/free-course-receipt/vitest.hook.config.mjs`. They execute the actual store hook with an offline delayed RPC, original-auth stub and captured notification port. Delayed success after unmount still attempts `notify-course-order` once, while parent refresh, limits/event and mounted UI acknowledgement remain suppressed. The positive case retains refresh, notification and success UI. Native window/query/SDK operations are stubbed; no real acquisition, notification or network occurs.

The original RPC remains authoritative for current source ownership, price, permission, quota and the delivered copy. No additional metadata/network queries or cache layer are introduced. Only a current own listing plus a zero-price valid copied-course receipt and the same actor/org/mounted lease can call the parent's existing `refreshBaseData` callback. An optional refresh failure does not fail or repeat a successful purchase.

The actual All Courses list is local state in `useOrganizationDataLoader`, supplied through `OrgDashboardContext`; `CoursesTab` is not mounted while the store tab is active. Its existing window listener can miss the receipt event. The new callback reaches the permanently mounted provider directly. The unused `qk.org.courses` key is not invalidated; no new fake query key is added.

Paid/customer acquisition, existing server-authorized notification attempt, source metadata, quotas and success receipt semantics remain unchanged. Mount/actor/org lease controls presentation only; it never suppresses the existing notification block after an already successful RPC. Same actor/org is rechecked before own success UI after awaited notifications. This does not introduce RPC idempotency, clone detection, a direct navigation CTA or new course acquisition in QA. Parent/provider wiring remains source-review scope; root owns actual execution and release.
