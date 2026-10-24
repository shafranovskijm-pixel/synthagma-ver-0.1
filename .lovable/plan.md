Read-only diagnosis result (no changes proposed)

Storage logs, 24.10.2026 06:15–06:25 UTC:
- Exact output path (…/versions/68028f4c-…/1188533c-….pdf): 0 records.
- Any org-documents request in 06:19–06:22:30: 0 records.
- Aggregate count of all Storage requests in 06:15–06:25: no rows returned.

Conclusion: the logs cannot confirm an upload POST failure or a later info 404 for this path. The logs are empty for the whole window, which points to log ingestion lag or the window not being available yet. It does not show that no request happened.

Next step (root): repeat the same read-only query later, or rely on the function's own response code. No source, SQL, deploy or settings changes.
