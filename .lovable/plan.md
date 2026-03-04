

## Plan: Swap title/category display + better category selector

### Problem
1. In the list, the short title (e.g., "до и выше 1000 В — Группа V") is bold and the category (full regulatory name) is secondary — user wants the opposite
2. Horizontal scroll for 11 categories is inconvenient — needs a better selector

### Changes

**`AdminMarketplaceManager.tsx`**:

1. **Swap title display** in list view:
   - Bold primary: category name (e.g., "Правила противопожарного режима в РФ")
   - Secondary muted: short title (e.g., "до и выше 1000 В — Группа V")

2. **Replace ScrollArea category filter** with a `Select` dropdown:
   - "Все категории (58)" as default
   - Each category as an option with count
   - Compact, no horizontal scrolling needed

