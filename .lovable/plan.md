
# Move "Chats" to Bottom of Sidebar

Move the "Чаты" button from its current position (after "Ученики") to the footer section, just before "Магазин курсов".

## Changes

### 1. `src/components/organization/OrgSidebar.tsx`
- **Remove** the "Чаты" button from the main nav section (lines 158-166)
- **Add** it to the footer section (line 237), right before the "Магазин курсов" button, with the same smaller styling as footer items

### 2. `src/hooks/useTabNavigation.ts`
- Move `"chats"` in the `getVisibleTabs()` array from after "students" to just before "services" to match the new sidebar order
