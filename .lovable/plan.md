

# Fix: RovingFocusGroupItem crash in Marketplace/Store

## Problem

The error `RovingFocusGroupItem must be used within RovingFocusGroup` happens because `TabsTrigger` (Radix UI) requires being inside a `TabsList` component. In the recent vertical nav refactor, `TabsTrigger` was placed inside a plain `<nav>` without `<TabsList>`, breaking the component hierarchy.

## Fix

In both files, replace the bare `<nav>` wrapper with a `<TabsList>` styled as a vertical column. This restores the required Radix context while keeping the visual design.

### `src/components/admin/AdminMarketplaceManager.tsx` (line ~180)

Replace:
```tsx
<nav className="flex flex-col gap-1 sticky top-4">
```
With:
```tsx
<TabsList className="flex flex-col gap-1 sticky top-4 h-auto bg-transparent p-0">
```
And close `</TabsList>` instead of `</nav>`.

### `src/components/organization/CourseStoreManager.tsx` (line ~104)

Same change — replace `<nav>` → `<TabsList>` with vertical styling.

| File | Change |
|---|---|
| `src/components/admin/AdminMarketplaceManager.tsx` | `<nav>` → `<TabsList>` vertical |
| `src/components/organization/CourseStoreManager.tsx` | `<nav>` → `<TabsList>` vertical |

