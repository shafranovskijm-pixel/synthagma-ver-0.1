

## Problem

The pipeline stops after 1-2 courses because of a **component unmount** issue:

1. After each course completes, `onComplete` calls `h.fetchData()`
2. `fetchData()` sets `isLoading = true`
3. `AdminMarketplaceManager` has `if (h.isLoading) return <Loading />` at line 519
4. This **unmounts** the `BulkPipelineWidget`, killing the running async pipeline loop
5. When loading finishes, the widget remounts fresh with all state reset

## Fix

Two changes needed:

### 1. `src/components/admin/AdminMarketplaceManager.tsx`
- Remove or modify the early return for `isLoading` so it doesn't unmount the entire content when data is being refreshed
- Option: only show loading on initial load (when `courses.length === 0`), or overlay a spinner without unmounting

### 2. `src/components/admin/BulkPipelineWidget.tsx`
- Change `onComplete` to not trigger a full refetch during pipeline execution
- Instead, defer the refetch until the pipeline finishes completely
- Use a `ref` to track running state and skip `onComplete` calls mid-pipeline, or batch the refresh to the end

### Recommended approach
- In `AdminMarketplaceManager`: change `if (h.isLoading)` to only apply on first load: `if (h.isLoading && h.courses.length === 0)`
- In `BulkPipelineWidget`: move the `onComplete?.()` call from inside the per-course loop (line 584) to after the entire pipeline finishes (after line 614), so data is refreshed once at the end

