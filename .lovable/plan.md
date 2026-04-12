

## Plan: Header Restructure + Remove Floating Chat + Remove Stats from Courses

### Changes

**1. Remove floating support chat button**
- Remove `<OrgSupportChat />` from `OrganizationDashboard.tsx`
- Support link stays in profile dropdown (already there)

**2. Restructure header to match SkillSpace layout (`OrgDashboardHeader.tsx`)**

Current: single bar with logo+title on left, all buttons on right

New layout (top-to-bottom):
- **Top bar**: Logo/org name on left. On right: Tariff badge (with days remaining), "Партнёрская программа" link, Notifications bell, Profile avatar — exactly like SkillSpace screenshot
- **Hero banner**: The cover image moves INTO the header area (below the top bar), with org name/description overlay — like SkillSpace's school banner
- **Action bar**: Below hero — tab-specific buttons ("Создать курс", search, filters, view toggles). These currently live inside CoursesTab and other tabs, so they stay there. The header just handles the top bar + hero.

The cover image rendering moves from `OrganizationDashboard.tsx` into `OrgDashboardHeader.tsx` so it's part of the header block.

**3. Remove StatsCards from courses tab (`TabContentRenderer.tsx`)**
- Add `activeTab !== "courses"` to the `shouldShowStatsCards` condition (or just remove StatsCards entirely from courses view)
- Stats remain visible on other tabs like links, stats tab etc.

### Files modified
| File | What |
|------|------|
| `src/components/organization/OrgDashboardHeader.tsx` | Restructure: top bar (tariff/partner/bell/profile) + hero banner with org info |
| `src/pages/OrganizationDashboard.tsx` | Remove `OrgSupportChat`, move cover image rendering to header |
| `src/components/organization/tabs/TabContentRenderer.tsx` | Hide StatsCards on courses tab |

### No database changes needed

