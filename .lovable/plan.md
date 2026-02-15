

## Plan: Free Plan Restrictions + AI Generation Limit

### 1. Hide "Закрывающие документы" for free plan

**File:** `src/components/organization/SubscriptionTab.tsx`

Wrap the billing documents `<Card>` section (lines 428-467) in a condition: only render when `currentPlan !== 'free'`. Free users don't need closing documents since they don't pay.

---

### 2. Feature links in the comparison table (already done, fix display)

Looking at the screenshots, the links ARE already in the comparison table rows (with external link icons). The separate "Feature Highlights" cards ALSO have links. The user wants links to be ONLY in the table, not in the separate cards section below.

**Action:** Remove the `link` property rendering from `FEATURE_HIGHLIGHTS` cards -- remove the "Подробнее" link from the feature highlight cards, since links are already available in the comparison table above.

**File:** `src/components/organization/SubscriptionTab.tsx` -- remove lines 324-328 (the Link element inside feature highlight cards).

---

### 3. Hide Passport/SNILS/Education stats cards on free plan

**File:** `src/components/organization/tabs/TabContentRenderer.tsx`

Pass the current subscription plan to `DocumentsStatsCards` or conditionally render it. The simplest approach: only show `DocumentsStatsCards` when the plan is NOT `free`.

Access `d.subscriptionLimits.plan` from `useOrgDashboard()` context and conditionally render:
```tsx
{activeTab === "students" && d.subscriptionLimits.plan !== 'free' && (
  <DocumentsStatsCards stats={d.documentsStats} />
)}
```

---

### 4. AI generation: 3 free attempts, then upgrade prompt

Currently AI is fully blocked for free plans (`aiEnabled: false`). Change approach:
- Allow AI generation for ALL plans but track usage count for free plan users
- After 3 AI generation attempts on free plan, show a toast/dialog prompting to upgrade

**Implementation:**

a) **Track AI usage in localStorage** per organization (simple, no DB needed):
   - Key: `ai_gen_count_{orgId}`
   - Increment on each successful AI generation call

b) **Create a helper hook** `src/hooks/useAiGenerationLimit.ts`:
   - Reads the counter from localStorage
   - Exposes `canGenerate: boolean`, `attemptsUsed: number`, `maxFreeAttempts: 3`
   - Exposes `incrementUsage()` and `showUpgradePrompt()`
   - For non-free plans, always returns `canGenerate: true`

c) **Integrate into `useCourseBuilder.ts`**:
   - Before calling any AI generation function, check `canGenerate`
   - If not allowed, show toast: "Вы использовали 3 бесплатные попытки ИИ-генерации. Перейдите на тариф Старт или выше для безлимитного доступа."
   - After successful generation, call `incrementUsage()`

d) **Update `subscriptionPlans.ts`**: Set `aiEnabled: true` for free plan (since we now allow 3 attempts) -- actually no, better to keep the constant as-is and handle the logic separately in the hook so we don't break other checks. The hook will independently check plan and counter.

---

### Technical Summary

**Files to create:**
- `src/hooks/useAiGenerationLimit.ts` -- new hook for AI generation counter

**Files to modify:**
- `src/components/organization/SubscriptionTab.tsx` -- hide billing docs for free, remove "Подробнее" links from highlight cards
- `src/components/organization/tabs/TabContentRenderer.tsx` -- hide DocumentsStatsCards for free plan
- `src/hooks/useCourseBuilder.ts` -- integrate AI generation limit check
- `src/components/course-builder/BlockEditor.tsx` -- integrate AI generation limit check for block-level AI generation

**No database changes required.**

