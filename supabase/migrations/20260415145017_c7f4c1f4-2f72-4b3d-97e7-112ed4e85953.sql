ALTER TABLE subscription_invoices ADD COLUMN IF NOT EXISTS payment_id text;
ALTER TABLE subscription_invoices ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'invoice';
ALTER TABLE subscription_invoices ADD COLUMN IF NOT EXISTS paid_at timestamptz;