-- Create app settings table for storing fees and other configuration
CREATE TABLE IF NOT EXISTS public.chawp_app_settings (
  id BIGINT PRIMARY KEY DEFAULT 1,
  service_fee DECIMAL(10, 2) NOT NULL DEFAULT 6,
  service_fee_mode TEXT NOT NULL DEFAULT 'flat' CHECK (service_fee_mode IN ('flat', 'percentage')),
  service_fee_percentage DECIMAL(10, 2) NOT NULL DEFAULT 0,
  delivery_fee DECIMAL(10, 2) NOT NULL DEFAULT 5,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Enable Row Level Security
ALTER TABLE public.chawp_app_settings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "public_read_settings" ON public.chawp_app_settings;
DROP POLICY IF EXISTS "admin_insert_settings" ON public.chawp_app_settings;
DROP POLICY IF EXISTS "admin_update_settings" ON public.chawp_app_settings;

-- Allow public to read settings
CREATE POLICY "public_read_settings" ON public.chawp_app_settings
  FOR SELECT
  USING (true);

-- Allow admin and super_admin to insert settings
CREATE POLICY "admin_insert_settings" ON public.chawp_app_settings
  FOR INSERT
  WITH CHECK (
    COALESCE(
      (SELECT role FROM public.chawp_user_profiles WHERE id = auth.uid()),
      'user'
    ) IN ('admin', 'super_admin')
  );

-- Allow admin and super_admin to update settings
CREATE POLICY "admin_update_settings" ON public.chawp_app_settings
  FOR UPDATE
  USING (
    COALESCE(
      (SELECT role FROM public.chawp_user_profiles WHERE id = auth.uid()),
      'user'
    ) IN ('admin', 'super_admin')
  );

-- Insert default settings
INSERT INTO public.chawp_app_settings (service_fee, service_fee_mode, service_fee_percentage, delivery_fee)
VALUES (6, 'flat', 0, 5)
ON CONFLICT (id) DO NOTHING;
