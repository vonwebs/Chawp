-- Add pay-after-delivery toggle + order payment fields

-- 1) App setting toggle (admin-controlled)
ALTER TABLE IF EXISTS public.chawp_app_settings
  ADD COLUMN IF NOT EXISTS pay_after_delivery_enabled BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE public.chawp_app_settings
SET pay_after_delivery_enabled = COALESCE(pay_after_delivery_enabled, FALSE)
WHERE id = 1;

-- 2) Orders: fields needed for pay-after-delivery flow
ALTER TABLE IF EXISTS public.chawp_orders
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'paid',
  ADD COLUMN IF NOT EXISTS payment_reference TEXT,
  ADD COLUMN IF NOT EXISTS service_fee DECIMAL(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_fee DECIMAL(10, 2) NOT NULL DEFAULT 0;

-- Note: We intentionally avoid adding new CHECK constraints here to
-- prevent conflicts with existing environments.
