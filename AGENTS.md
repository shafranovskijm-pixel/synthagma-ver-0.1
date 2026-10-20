# Project guidance

- Edge tests use explicit `.ts` relative imports so both Deno validation and Vitest resolve the same modules.
- Document compiler functions resolve their pinned npm packages using scoped Deno auto-install configuration without modifying the shared lockfile.