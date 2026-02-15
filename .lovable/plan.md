

## Plan: Improve Subscription Tab + Admin Document Management

### 1. Collapse notifications into accordion

Wrap `MissingCredentialsAlert` in `OrganizationDashboard.tsx` inside a `Collapsible` component, collapsed by default. The alert will show a compact summary line, expandable on click.

**File:** `src/pages/OrganizationDashboard.tsx`

---

### 2. Add missing features to tariff comparison table + feature links

The current `featureRows` array in `SubscriptionTab.tsx` is missing several features available in the system. Add these rows and make each feature name a clickable link to its dedicated feature page.

**New rows to add:**
| Feature | Link |
|---------|------|
| Компании | (no feature page) |
| Журналы | (no feature page) |
| Документооборот | `/feature/documents` |
| Охрана труда | `/feature/labor-safety` |
| ФИС ФРДО | `/feature/frdo` |
| Магазин курсов | `/feature/course-store` |
| Библиотека | (no feature page) |
| Обучаемых / мес | (numeric limit from `maxTrainedPerMonth`) |

Each feature name in the table becomes a link (using `react-router-dom` `Link`) to the corresponding `/feature/...` page where available, with an `ExternalLink` icon hint.

**File:** `src/components/organization/SubscriptionTab.tsx`

Also update `FEATURE_HIGHLIGHTS` to include links, so the "locked feature" cards link to learn-more pages.

---

### 3. Documents folder in Subscription Tab

Add a new section "Закрывающие документы" at the bottom of `SubscriptionTab.tsx`:
- Shows a list of documents (invoices, receipts) uploaded by admin for this organization
- Fetched from a new `org_billing_documents` table
- Each document has: name, type (invoice/receipt), date, download link
- Read-only for organization users

**New database table:**
```sql
CREATE TABLE public.org_billing_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  doc_type text NOT NULL DEFAULT 'invoice', -- invoice, receipt, act, other
  file_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  uploaded_by uuid
);

ALTER TABLE org_billing_documents ENABLE ROW LEVEL SECURITY;

-- Org users can view their own documents
CREATE POLICY "Org users can view own billing docs"
  ON org_billing_documents FOR SELECT
  USING (organization_id IN (
    SELECT id FROM organizations WHERE id = organization_id
    AND id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid())
  ));

-- Admins can manage all
CREATE POLICY "Admins can manage billing docs"
  ON org_billing_documents FOR ALL
  USING (EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'
  ));
```

---

### 4. Admin interface for uploading billing documents

Add a new section in `TariffsManager.tsx` -- "Документы для организаций":
- Select an organization from a dropdown
- Upload a file (invoice/receipt) to storage bucket `billing-documents`
- Specify document type (Счёт / Чек / Акт)
- Uploaded documents appear in a table with: org name, doc name, type, date, download/delete actions
- This is a manual process for now (as requested), to be automated later

**File:** `src/components/admin/TariffsManager.tsx`

---

### Technical Summary

**Files to create:** none (all changes in existing files)

**Files to modify:**
- `src/pages/OrganizationDashboard.tsx` -- wrap alert in Collapsible
- `src/components/organization/SubscriptionTab.tsx` -- add feature rows with links, add billing documents section
- `src/components/admin/TariffsManager.tsx` -- add billing document upload/management UI

**Database:**
- Create `org_billing_documents` table with RLS
- Create storage bucket `billing-documents`
