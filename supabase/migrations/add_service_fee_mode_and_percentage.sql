-- Add support for service fee mode: flat amount or percentage of cart subtotal.
ALTER TABLE public.chawp_app_settings
  ADD COLUMN IF NOT EXISTS service_fee_mode TEXT NOT NULL DEFAULT 'flat',
  ADD COLUMN IF NOT EXISTS service_fee_percentage DECIMAL(10, 2) NOT NULL DEFAULT 0;

-- Normalize existing rows.
UPDATE public.chawp_app_settings
SET service_fee_mode = 'flat'
WHERE service_fee_mode IS NULL OR btrim(service_fee_mode) = '';

UPDATE public.chawp_app_settings
SET service_fee_percentage = 0
WHERE service_fee_percentage IS NULL OR service_fee_percentage < 0;

-- Keep mode values constrained.
ALTER TABLE public.chawp_app_settings
  DROP CONSTRAINT IF EXISTS chawp_app_settings_service_fee_mode_check;

ALTER TABLE public.chawp_app_settings
  ADD CONSTRAINT chawp_app_settings_service_fee_mode_check
  CHECK (service_fee_mode IN ('flat', 'percentage'));
