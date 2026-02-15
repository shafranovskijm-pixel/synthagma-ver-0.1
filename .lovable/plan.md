

## Plan: Show Features on Free Plan but Block with Upgrade Message

### Overview

Make course settings, reminders, student document checklist, and student dashboard features **visible** on the free plan, but show an upgrade prompt ("Доступно на другом тарифе") when users try to interact with them.

---

### 1. CourseDetailsModal -- Settings & Reminders tabs (gated interaction)

**File:** `src/components/organization/dialogs/CourseDetailsModal.tsx`

- Import `useSubscriptionLimits` and pass `organizationId` to get the current plan
- In the **Settings** tab content (line ~802): wrap the controls in a check. If plan is `'free'`, render the same layout but with all `Switch` components **disabled** and overlay/badge showing "Доступно на тарифе Старт и выше"
- In the **Reminders** tab content (line ~1060): same approach -- show the UI but if plan is `'free'`, disable all inputs and show upgrade message

The tabs themselves remain visible and clickable -- only the interactive controls inside are disabled with a clear message.

---

### 2. StudentDetailCard / ProfileTab -- Document checklist items (passport, SNILS, education)

**File:** `src/components/organization/student-detail/ProfileTab.tsx`

- Accept an optional `orgPlan` prop (or fetch it inside the component)
- For the document checklist items `passport`, `snils`, and `education_doc`: if `orgPlan === 'free'`, replace the "Загрузить" button with a disabled button + tooltip/text "Доступно на другом тарифе"
- The cards remain visible so users see what features exist
- Contract and Consent items are NOT gated (available on free)

**File:** `src/components/organization/StudentDetailCard.tsx`

- Pass the organization's plan to `ProfileTab` via the hook or by fetching it

---

### 3. Student Dashboard -- Features gated for students of free-plan orgs

**File:** `src/hooks/useStudentDashboard.ts`

- After fetching the organization, also fetch `subscription_plan` from the `organizations` table
- Expose `orgPlan` in the hook's return value

**File:** `src/pages/StudentDashboard.tsx`

- For "Идентификация", "Мои документы" sidebar items: if `orgPlan === 'free'`, on click show a toast "Эта функция доступна на другом тарифе" instead of opening the panel
- Keep the menu items visible but add a lock icon or visual indicator

---

### Technical Summary

**Files to modify:**
- `src/components/organization/dialogs/CourseDetailsModal.tsx` -- add plan check, disable settings/reminders on free
- `src/components/organization/student-detail/ProfileTab.tsx` -- gate passport/SNILS/education upload on free plan
- `src/components/organization/StudentDetailCard.tsx` -- pass plan prop
- `src/hooks/useStudentDashboard.ts` -- fetch and expose `orgPlan`
- `src/pages/StudentDashboard.tsx` -- gate student features on free plan

**No database changes required.**
