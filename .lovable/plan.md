

## Plan: SkillSpace-Style Organization Dashboard Redesign

### Problem
The current org dashboard uses a traditional wide sidebar (264px) with text labels. The user wants it to match the SkillSpace aesthetic (and the student dashboard style already implemented): narrow icon sidebar, top header bar with profile/notifications/tariff, course catalog with visual cards, footer, and support chat button.

### Scope
This is a large UI restructuring. Nothing gets deleted — Documents, Journals, and FRDO move into Settings as sub-sections. All functionality preserved.

### Changes

**1. New Icon Sidebar (`OrgSidebar.tsx`) — SkillSpace-style**
- Narrow 88px sidebar matching `StudentSidebar.tsx` pattern
- Brand-tinted background with centered nav pill
- Icon buttons (64×64px) with 10px labels underneath
- Tabs kept in sidebar: Курсы, Компании, Ученики, Охрана труда, Финансы, Настройки, Чаты
- Tabs REMOVED from sidebar: Документы, Журналы, ФИС ФРДО (moved to Settings)
- Optional tabs (Хранилище, Статистика, Ссылки, Магазин курсов, Тариф) stay toggleable via Settings
- Logo at top, same as student sidebar

**2. New Top Header Bar (`OrgDashboardHeader.tsx`) — SkillSpace-style**
- Left: Logo + org name (like SkillSpace header)
- Right: Tariff badge with days remaining, Partner program link, Notifications bell (with `OrgNotifications` dropdown), Profile avatar dropdown (Profile, Help, What's New, Logout)
- Tab-specific action buttons (Create Course, Add Student, etc.) remain in header
- Remove the hamburger menu button (mobile will use slide-out overlay)

**3. Course Catalog Visual Mode (CoursesTab.tsx enhancement)**
- Add a new "catalog" view mode alongside existing folder/grid/list views
- Catalog mode: SkillSpace-style cards with course cover images, status badges, descriptions
- Courses grouped by category with colored dot indicators
- Toggle to switch back to current folder/list view (user explicitly asked for this)
- "Настроить каталог" button option

**4. Footer Component (`OrgDashboardFooter.tsx`) — new**
- Reuse `StudentFooter.tsx` pattern
- Shows org logo, name, platform links, document links, partner program CTA
- Rendered below all tab content on every page

**5. Support Chat Button (bottom-right floating)**
- Floating green chat button in bottom-right corner (matching SkillSpace's chat bubble)
- Opens Telegram link (to your support bot/channel)
- Also includes "Помощь" link

**6. Move Documents/Journals/FRDO into Settings (`SettingsTab.tsx`)**
- Add 3 new collapsible sections in Settings:
  - "Документооборот" — renders `DocumentsTab` content
  - "Журналы" — renders `JournalsManager` content
  - "ФИС ФРДО" — renders `FRDOManager` content
- These remain fully functional, just accessible from Settings instead of sidebar
- Keep the menu toggles in Settings for when user wants to re-enable them in sidebar later

**7. Layout Update (`OrganizationDashboard.tsx`)**
- Change `lg:ml-64` to `ml-[88px]` to match narrower sidebar
- Add footer below main content
- Add floating support chat button
- Keep admin view banner, mobile overlay, dialogs

**8. Tab Navigation Update (`useTabNavigation.ts`)**
- Remove `documents`, `journals`, `frdo` from default visible tabs
- Keep them accessible programmatically (for internal navigation from Settings)

### Files modified
| File | What |
|------|------|
| `src/components/organization/OrgSidebar.tsx` | Complete rewrite to 88px icon sidebar |
| `src/components/organization/OrgDashboardHeader.tsx` | SkillSpace-style header with profile, notifications, tariff |
| `src/pages/OrganizationDashboard.tsx` | Layout adjustments, add footer + support chat |
| `src/components/organization/OrgDashboardFooter.tsx` | New footer component |
| `src/components/organization/OrgSupportChat.tsx` | New floating chat button |
| `src/components/organization/tabs/SettingsTab.tsx` | Add Documents/Journals/FRDO sections |
| `src/components/organization/tabs/TabContentRenderer.tsx` | Keep documents/journals/frdo rendering for programmatic access |
| `src/hooks/useTabNavigation.ts` | Update default visible tabs |

### No database changes needed

