ALTER TABLE organizations 
  ADD COLUMN custom_price numeric DEFAULT NULL,
  ADD COLUMN custom_discount numeric DEFAULT NULL;