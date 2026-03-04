

## Plan: Grouped catalog like the Excel file structure

### Current state
Flat list with category shown as text under each row. Select dropdown to filter by one category.

### Target
Group courses visually by category (regulatory document), like sections in the Excel file. Each category = collapsible section header, courses listed under it as compact rows.

### Changes

**`AdminMarketplaceManager.tsx`** — Replace flat table with grouped accordion-style list:

1. Remove the category `Select` dropdown (no longer needed — all categories visible at once)
2. Group `filteredCourses` by `extractCategory()` 
3. Render each group as a collapsible section:
   - Header: category name (bold) + course count badge
   - Body: compact table of courses showing short title (voltage + group), prices, status toggle, actions
4. Keep search bar — filters across all groups, hides empty groups
5. Keep grid/list toggle

**`useAdminMarketplace.ts`** — Add a `groupedCourses` computed value:
```
Map<string, MarketplaceCourseWithDetails[]>
```
grouped by `extractCategory()`, maintaining sort order.

### Visual structure
```text
┌─────────────────────────────────────────────────┐
│ [Search...]                        [List] [Grid] │
├─────────────────────────────────────────────────┤
│ ▼ Правила устройства электроустановок (8)       │
│   до 1000 В — Группа II      3500₽  5000₽  ⚙  │
│   до 1000 В — Группа III     3500₽  5000₽  ⚙  │
│   ...                                           │
│ ▼ Правила по охране труда при эксплуатации... (8)│
│   до 1000 В — Группа II      3500₽  5000₽  ⚙  │
│   ...                                           │
└─────────────────────────────────────────────────┘
```

Uses Radix `Collapsible` or `Accordion` for expand/collapse. All groups open by default.

