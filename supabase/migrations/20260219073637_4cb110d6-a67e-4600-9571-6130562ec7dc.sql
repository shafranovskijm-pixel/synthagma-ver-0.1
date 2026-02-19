ALTER TABLE public.marketplace_orders DROP CONSTRAINT marketplace_orders_payment_method_check;
ALTER TABLE public.marketplace_orders ADD CONSTRAINT marketplace_orders_payment_method_check 
CHECK (payment_method IS NULL OR payment_method = ANY (ARRAY['invoice'::text, 'online'::text, 'balance'::text]));