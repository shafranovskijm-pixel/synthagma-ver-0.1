

## Plan: Storage Rework, Tariff Relocation, Admin Org Card Overhaul

### Summary
Multiple changes to the org sidebar, admin org detail view, and storage concept. Key themes: (1) Storage becomes read-only view of course files, hidden by default; (2) Tariff moves from sidebar to header-only in org dashboard, and into admin org card; (3) Admin org card replaces stats widgets with org cover/branding preview and adds a "Тарифы" tab.

---

### Changes

**1. Remove "Тариф" from org sidebar (`OrgSidebar.tsx`)**
- Remove the `subscription` nav item from `navItems` array (line 142)
- Tariff info stays in the top header bar only (already shows "Стандарт — 195 дн.")

**2. Storage: hide by default, make read-only (`SettingsTab.tsx`)**
- Change `showLibrary` default to `false` in menu settings initialization
- In the library/storage tab content, remove upload functionality — only show files that were uploaded through courses (read-only file browser)
- Update description text: "Файлы, загруженные через курсы" instead of "Управление файлами"

**3. Admin org detail — replace stats widgets with cover/branding preview (`OrganizationDetailsView.tsx`)**
- Remove the 6-card stats grid (Учеников, Курсов, Завершено, Средний прогресс, Хранилище, ИИ-генерации) from the header area
- Replace with: org cover image (fetched from org branding) + org brand colors preview
- Show the cover image the org has set, with their primary color accents, so admin can see exactly what the org looks like

**4. Admin org detail — add "Тарифы" tab (`OrganizationDetailsView.tsx`)**
- Add a new `TabsTrigger` for "Тарифы" (with CreditCard icon) after "Настройки"
- Tab content: editable tariff card matching the SkillSpace reference screenshot:
  - Current plan name (editable dropdown: Бесплатный/Старт/Стандарт/Профессиональный/Максимальный)
  - Custom description field (e.g. "Стандарт плюс особые условия") — admin can write any text
  - `paid_until` date picker — admin sets expiration date
  - Usage bars: Курсы (used/limit), Ученики (used/limit), Обучено в этом месяце, Хранилище
  - Section "Возможности, доступные на старших тарифах" showing locked features
- This tariff info then displays in the org's own subscription page as configured by admin

**5. Org SubscriptionTab reads admin-configured tariff data (`SubscriptionTab.tsx`)**
- Display the custom description set by admin (if any) alongside the plan name
- Show the `paid_until` date set by admin
- Keep existing usage metrics and plan comparison

**6. Database: add custom tariff fields to `organizations` table**
- Migration: `ALTER TABLE organizations ADD COLUMN IF NOT EXISTS tariff_custom_label text, ADD COLUMN IF NOT EXISTS paid_until timestamptz;`
- These fields let admin customize what the org sees on their tariff page

---

### Files modified
| File | What |
|------|------|
| `src/components/organization/OrgSidebar.tsx` | Remove subscription/tariff nav item |
| `src/components/organization/tabs/SettingsTab.tsx` | Default `showLibrary` to false, update storage description |
| `src/components/admin/OrganizationDetailsView.tsx` | Replace stats grid with cover preview; add "Тарифы" tab with editable tariff config |
| `src/components/organization/SubscriptionTab.tsx` | Read and display `tariff_custom_label` and `paid_until` from org data |
| Migration | Add `tariff_custom_label` and `paid_until` columns to `organizations` |

### Database changes
- Add `tariff_custom_label text` and `paid_until timestamptz` to `organizations` table

