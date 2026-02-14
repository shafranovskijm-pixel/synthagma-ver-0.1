
-- 1. Add balance column to organizations
ALTER TABLE public.organizations 
  ADD COLUMN IF NOT EXISTS balance NUMERIC NOT NULL DEFAULT 0;

-- 2. Create balance_transactions table
CREATE TABLE public.balance_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  type TEXT NOT NULL,
  description TEXT,
  related_order_id UUID REFERENCES public.marketplace_orders(id),
  performed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.balance_transactions ENABLE ROW LEVEL SECURITY;

-- RLS: Admins can do everything
CREATE POLICY "Admins can manage balance transactions"
ON public.balance_transactions
FOR ALL
USING (has_role('admin'::app_role, auth.uid()))
WITH CHECK (has_role('admin'::app_role, auth.uid()));

-- RLS: Organizations can view their own transactions
CREATE POLICY "Orgs can view own balance transactions"
ON public.balance_transactions
FOR SELECT
USING (organization_id = current_organization_id());

-- 3. Make marketplace_courses.organization_id nullable
ALTER TABLE public.marketplace_courses ALTER COLUMN organization_id DROP NOT NULL;

-- 4. Drop and recreate the foreign key to allow NULL
-- (FK already allows NULL by default with DROP NOT NULL, no change needed)

-- 5. Update RLS on marketplace_courses: ensure admin-created courses (org_id IS NULL) are visible
-- First drop existing select policy if any, then recreate
DROP POLICY IF EXISTS "Anyone can view active marketplace courses" ON public.marketplace_courses;

CREATE POLICY "Anyone can view active marketplace courses"
ON public.marketplace_courses
FOR SELECT
USING (is_active = true);

-- Admins can manage all marketplace courses
DROP POLICY IF EXISTS "Admins can manage marketplace courses" ON public.marketplace_courses;

CREATE POLICY "Admins can manage marketplace courses"
ON public.marketplace_courses
FOR ALL
USING (has_role('admin'::app_role, auth.uid()))
WITH CHECK (has_role('admin'::app_role, auth.uid()));
