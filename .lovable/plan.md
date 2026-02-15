

## Plan: Fix Student Marketplace + Fix User Registration Data

### Problem 1: Marketplace shows "В разработке" for students
The student dashboard (`StudentDashboard.tsx`, lines 156-164) has a **hardcoded placeholder** instead of rendering the existing `StudentCourseStore` component. There are 3 active courses in the marketplace, but students never see them.

### Problem 2: User free@free.com stuck as "student"
The registration bug (fixed in the previous change by removing the duplicate `create_organization` overload) left this user without an organization. Need to manually fix their data.

---

### Fix 1: Replace placeholder with StudentCourseStore

**File: `src/pages/StudentDashboard.tsx`**

Replace the hardcoded "Магазин в разработке" block (lines 156-164) with the `StudentCourseStore` component:

```tsx
{activeTab === "store" && user && (
  <div className="p-8">
    <StudentCourseStore 
      userId={user.id} 
      organizationId={profile?.organization_id || ""} 
    />
  </div>
)}
```

Add the import for `StudentCourseStore` at the top of the file.

### Fix 2: Create organization for free@free.com via SQL migration

Run a migration that:
1. Creates an organization for the user (using the data they provided during registration -- we'll use a generic name since we don't have the original org name)
2. Links the profile to the new organization
3. Adds the `organization` role in `user_roles`

Since we don't know the organization name the user entered, we'll create a placeholder that can be edited. Alternatively, if this is just a test account, we can skip this step.

**SQL migration:**
```sql
-- Create organization for orphaned user
DO $$
DECLARE
  v_user_id uuid := 'c9929836-0cb0-422f-ab22-d5f42725afd4';
  v_org_id uuid;
BEGIN
  INSERT INTO organizations (name, email)
  VALUES ('Организация (free@free.com)', 'free@free.com')
  RETURNING id INTO v_org_id;

  UPDATE profiles SET organization_id = v_org_id WHERE user_id = v_user_id;

  INSERT INTO user_roles (user_id, role)
  VALUES (v_user_id, 'organization')
  ON CONFLICT (user_id, role) DO NOTHING;
END $$;
```

### Summary of changes
- **1 file edited**: `src/pages/StudentDashboard.tsx` -- import and render `StudentCourseStore`
- **1 SQL migration**: fix orphaned user data

