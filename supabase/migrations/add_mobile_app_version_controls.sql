-- Add per-app, per-platform version control fields managed by admin
ALTER TABLE public.chawp_app_settings
  ADD COLUMN IF NOT EXISTS chawp_min_android_version TEXT NOT NULL DEFAULT '1.0.0',
  ADD COLUMN IF NOT EXISTS chawp_min_ios_version TEXT NOT NULL DEFAULT '1.0.0',
  ADD COLUMN IF NOT EXISTS chawp_android_store_url TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS chawp_ios_store_url TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS chawp_release_note TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS vendor_min_android_version TEXT NOT NULL DEFAULT '1.0.0',
  ADD COLUMN IF NOT EXISTS vendor_min_ios_version TEXT NOT NULL DEFAULT '1.0.0',
  ADD COLUMN IF NOT EXISTS vendor_android_store_url TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS vendor_ios_store_url TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS vendor_release_note TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS delivery_min_android_version TEXT NOT NULL DEFAULT '1.0.0',
  ADD COLUMN IF NOT EXISTS delivery_min_ios_version TEXT NOT NULL DEFAULT '1.0.0',
  ADD COLUMN IF NOT EXISTS delivery_android_store_url TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS delivery_ios_store_url TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS delivery_release_note TEXT NOT NULL DEFAULT '';

UPDATE public.chawp_app_settings
SET
  chawp_min_android_version = COALESCE(NULLIF(chawp_min_android_version, ''), '1.0.0'),
  chawp_min_ios_version = COALESCE(NULLIF(chawp_min_ios_version, ''), '1.0.0'),
  chawp_android_store_url = COALESCE(chawp_android_store_url, ''),
  chawp_ios_store_url = COALESCE(chawp_ios_store_url, ''),
  chawp_release_note = COALESCE(chawp_release_note, ''),
  vendor_min_android_version = COALESCE(NULLIF(vendor_min_android_version, ''), '1.0.0'),
  vendor_min_ios_version = COALESCE(NULLIF(vendor_min_ios_version, ''), '1.0.0'),
  vendor_android_store_url = COALESCE(vendor_android_store_url, ''),
  vendor_ios_store_url = COALESCE(vendor_ios_store_url, ''),
  vendor_release_note = COALESCE(vendor_release_note, ''),
  delivery_min_android_version = COALESCE(NULLIF(delivery_min_android_version, ''), '1.0.0'),
  delivery_min_ios_version = COALESCE(NULLIF(delivery_min_ios_version, ''), '1.0.0'),
  delivery_android_store_url = COALESCE(delivery_android_store_url, ''),
  delivery_ios_store_url = COALESCE(delivery_ios_store_url, ''),
  delivery_release_note = COALESCE(delivery_release_note, '')
WHERE id = 1;
