
# Plan: Sync storage limits with subscription plan

## Problem
Currently, `storage_limit_bytes` in the `organizations` table is a static value (default 1 GB) that never updates when the subscription plan changes. All organizations show "100 MB" or "1 GB" storage regardless of their actual plan (e.g., "Maximum" plan should have 100 GB).

## Solution

### 1. Database trigger to auto-sync storage limit on plan change
Create a PostgreSQL trigger that fires whenever `subscription_plan` is updated on the `organizations` table. It will automatically set `storage_limit_bytes` to the correct value based on the plan:

| Plan | Storage |
|------|---------|
| free | 100 MB |
| start | 1 GB |
| standard | 5 GB |
| professional | 20 GB |
| maximum | 100 GB |

### 2. One-time migration to fix all existing organizations
Run an UPDATE to correct all existing organizations' `storage_limit_bytes` based on their current `subscription_plan`.

### 3. Use plan-based limits in the frontend (fallback)
Update `useSubscriptionLimits` to expose the `storageBytes` from the plan config, so UI components can use the plan-derived limit as the source of truth rather than relying solely on the DB column.

Update `OrganizationDetailsView.tsx` (admin panel) to initialize `storage_limit_bytes` from the plan config when viewing an organization, ensuring the stats cards and progress bars show correct limits.

---

## Technical details

### Database migration (SQL)

```sql
-- 1. Trigger function to sync storage_limit_bytes on plan change
CREATE OR REPLACE FUNCTION sync_storage_limit_on_plan_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.subscription_plan IS DISTINCT FROM OLD.subscription_plan THEN
    NEW.storage_limit_bytes := CASE NEW.subscription_plan
      WHEN 'free' THEN 104857600
      WHEN 'start' THEN 1073741824
      WHEN 'standard' THEN 5368709120
      WHEN 'professional' THEN 21474836480
      WHEN 'maximum' THEN 107374182400
      ELSE 104857600
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_storage_limit
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION sync_storage_limit_on_plan_change();

-- 2. Fix all existing organizations
UPDATE public.organizations SET storage_limit_bytes = CASE subscription_plan
  WHEN 'free' THEN 104857600
  WHEN 'start' THEN 1073741824
  WHEN 'standard' THEN 5368709120
  WHEN 'professional' THEN 21474836480
  WHEN 'maximum' THEN 107374182400
  ELSE 104857600
END;

-- 3. Update default for new orgs (free plan default)
ALTER TABLE public.organizations ALTER COLUMN storage_limit_bytes SET DEFAULT 104857600;
```

### Frontend changes

**`src/hooks/useSubscriptionLimits.ts`**: Add `storageLimit` to the returned state, derived from `planInfo.limits.storageBytes`.

**`src/components/admin/OrganizationDetailsView.tsx`**: When initializing settings, if the org's `storage_limit_bytes` doesn't match the plan config, use the plan's value. This ensures the admin panel always shows the correct limit for the plan. The admin can still override it manually in settings.

**`src/hooks/useLibraryManager.ts`**: No changes needed -- it already reads `storage_limit_bytes` from the DB, which will now be correct thanks to the trigger and migration.
