

## Fix: Registration Error -- `organizations_tariff_type_check` Constraint Violation

### Problem

The `create_organization` database function inserts `tariff_type = 'free'` when creating a new organization, but the `organizations` table has a CHECK constraint that only allows `'trial'`, `'monthly'`, or `'yearly'`:

```
CHECK (tariff_type IN ('trial', 'monthly', 'yearly'))
```

This causes every new organization registration to fail.

### Solution

Update the CHECK constraint to also accept `'free'` as a valid tariff type. This is the correct fix because:
- The system already uses `'free'` as the default tariff type in the `create_organization` function
- It aligns with the `subscription_plan = 'free'` that is also set during registration

### Database Migration

```sql
ALTER TABLE public.organizations DROP CONSTRAINT organizations_tariff_type_check;
ALTER TABLE public.organizations ADD CONSTRAINT organizations_tariff_type_check 
  CHECK (tariff_type IN ('free', 'trial', 'monthly', 'yearly'));
```

### Technical Details

**Files to modify:** None -- this is a database-only fix via migration.

Single migration to drop and recreate the constraint with the added `'free'` value.
