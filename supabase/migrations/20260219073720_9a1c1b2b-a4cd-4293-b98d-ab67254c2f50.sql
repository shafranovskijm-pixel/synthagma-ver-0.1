-- Drop the problematic ALL policy and recreate as INSERT-specific
DROP POLICY "Buyers can create orders" ON public.marketplace_orders;
CREATE POLICY "Buyers can create orders" ON public.marketplace_orders
FOR INSERT WITH CHECK (
  (buyer_user_id = auth.uid()) OR (buyer_organization_id = current_organization_id())
);