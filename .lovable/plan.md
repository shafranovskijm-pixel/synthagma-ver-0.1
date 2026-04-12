

## Plan: SkillSpace-Style Header Polish + Notifications Tabs + Default Cover Placeholder

### Problem
1. Header doesn't match SkillSpace reference — needs bigger icons, tariff with days remaining, proper profile avatar with initials
2. Notifications panel is flat — needs tabbed filtering (Все / Задания / Оплаты) like SkillSpace
3. No default cover image — when org has no cover, should show a branded placeholder with "Изменить обложку" button
4. Profile dropdown needs "Что нового?" item like SkillSpace

### Changes

**1. Header top bar (`OrgDashboardHeader.tsx`)**
- Tariff badge: fetch `paid_until` from org data, calculate days remaining, show as "Тариф «Стандарт» — 195 дней" with green checkmark icon (like SkillSpace)
- Partner program: show as styled link with icon, not ghost button
- Notifications: replace inline dropdown with `<OrgNotifications>` component (already exists, uses Popover)
- Profile avatar: larger (40px), show user initials in colored circle (not generic User icon), with notification count badge on bell
- Profile dropdown: add "Что нового?" menu item with Sparkles icon
- Increase icon sizes throughout (bell 5→5, avatar 8→10)

**2. Notifications with tabs (`OrgNotifications.tsx`)**
- Add tab bar at top: "Все" (with total count badge), "Задания" (filter by task-related types), "Оплаты" (filter by payment types)
- Each tab shows a rounded badge with count
- Teal active tab styling matching SkillSpace screenshot
- Add "Отметить все как прочитанные" link at bottom
- Show sender initials in colored circles (like SkillSpace's ЮФ, ТО, А circles)

**3. Default cover placeholder (in `OrgDashboardHeader.tsx`)**
- When `coverUrl` is empty, show a teal gradient placeholder banner (same height as hero)
- Overlay text: org logo + "Онлайн-обучение" label + org name + subtitle
- "Изменить обложку" button in top-right corner of banner (both when cover exists and when placeholder)
- Clicking triggers the existing cover upload from branding settings
- Generate a default gradient background image via AI for the placeholder

**4. Profile initials**
- Get user name/email from auth context
- Extract initials (first letter of first + last name)
- Display in a colored avatar circle matching SkillSpace style

### Files modified
| File | What |
|------|------|
| `src/components/organization/OrgDashboardHeader.tsx` | Tariff with days, bigger icons, profile initials avatar, cover placeholder with upload button, "Что нового?" |
| `src/components/organization/OrgNotifications.tsx` | Add tabbed filtering (Все/Задания/Оплаты), sender initials, bottom "mark all read" |
| `src/assets/default-org-cover.jpg` | AI-generated teal gradient placeholder image |

### No database changes needed

