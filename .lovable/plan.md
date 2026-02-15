

## Plan: Subscription Management for Organizations + Admin Tariff Controls

### Overview

Add a "Tariff" tab in the organization dashboard showing the current plan with upgrade/downgrade options, and enhance the admin panel with expiration tracking and renewal reminders.

---

### Part 1: Organization "Tariff" Tab (new)

**New file: `src/components/organization/SubscriptionTab.tsx`**

A full-page tab showing:

1. **Current Plan Card** -- name, price, expiry date (`paid_until`), days remaining with color-coded urgency (green > 30 days, yellow 7-30, red < 7)
2. **Usage Meters** -- progress bars for courses, students, storage (from `useSubscriptionLimits`)
3. **Plan Comparison Grid** -- all 5 plans side by side (reuse `SUBSCRIPTION_PLANS` and `featureRows` pattern from `PricingPlans.tsx`), current plan highlighted, upgrade/downgrade buttons
4. **Feature Highlights** -- for each higher plan, show 2-3 key unlocked features with icons:
   - **Start**: Companies, course settings, more students
   - **Standard**: Branding, video ID, document checklist
   - **Professional**: Journals, documents, labor safety, 20GB
   - **Maximum**: AI generation, FRDO, unlimited everything, API
5. **Request Change Button** -- since payment isn't integrated yet, clicking "Upgrade" opens a dialog that sends a request (inserts into a new `subscription_requests` table) with the desired plan, and shows org a toast "Request sent, we will contact you"

**Integration into dashboard:**

- Add `"subscription"` to `TabType` union in `OrgSidebar.tsx`
- Add `CreditCard` icon tab in sidebar (before Settings)
- Add rendering in `TabContentRenderer.tsx`
- Add to `useTabNavigation.ts` visible tabs

---

### Part 2: Admin Tariff Management Enhancements

**Enhance: `src/components/admin/TariffsManager.tsx`**

Add to the existing manager:

1. **Expiration Alerts Panel** -- top section showing organizations with plans expiring in < 7 days (red), < 30 days (yellow), expired (with "Expired" badge)
2. **Set Expiry Date** -- date picker column in the table to set/edit `paid_until` for each org
3. **Batch Reminder** -- button to send email reminders to all orgs with expiring plans (calls a new edge function or just marks them)
4. **Quick Stats Update** -- add "Paid" / "Expired" / "Expiring Soon" counters to the stats row

---

### Part 3: Database Changes

**New table: `subscription_requests`**

```sql
CREATE TABLE subscription_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  current_plan text NOT NULL,
  requested_plan text NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- pending, approved, rejected
  message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  processed_by uuid
);

-- RLS: org can insert/view own, admin can manage all
ALTER TABLE subscription_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org users can create requests" ON subscription_requests
  FOR INSERT WITH CHECK (organization_id = current_organization_id());

CREATE POLICY "Org users can view own requests" ON subscription_requests
  FOR SELECT USING (organization_id = current_organization_id());

CREATE POLICY "Admins can manage all requests" ON subscription_requests
  FOR ALL USING (has_role('admin', auth.uid()));
```

---

### Part 4: Upsell Strategy (built into the UI)

Key selling points embedded in the Subscription tab:

| Feature | Pitch |
|---------|-------|
| Branding | "Your logo and colors on the student portal" |
| Video ID | "Verify student identity automatically" |
| Document Checklist | "Ensure 100% document compliance before enrollment" |
| AI Generation | "Create course content in minutes with AI" |
| FRDO | "Automated reporting to the federal registry" |
| Journals | "Auto-generated attendance and grading journals" |
| Labor Safety | "Full occupational safety training management" |
| Unlimited | "No caps on courses or students -- scale freely" |

These will appear as locked feature cards with a "sparkle" icon, showing what the org is missing and which plan unlocks it.

---

### Technical Details

**Files to create:**
- `src/components/organization/SubscriptionTab.tsx` -- main subscription UI

**Files to modify:**
- `src/components/organization/OrgSidebar.tsx` -- add "subscription" tab type and menu item
- `src/hooks/useTabNavigation.ts` -- include "subscription" in visible tabs
- `src/components/organization/tabs/TabContentRenderer.tsx` -- render SubscriptionTab
- `src/components/admin/TariffsManager.tsx` -- add expiration tracking, date picker, alerts

**Database:**
- Create `subscription_requests` table with RLS

