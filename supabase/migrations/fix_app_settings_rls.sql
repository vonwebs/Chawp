-- Fix RLS policies for app settings table
-- The issue: RLS policies were checking chawp_admin_users table which doesn't exist or has wrong structure
-- Solution: Use chawp_user_profiles table which contains the actual admin role information

-- Drop existing policies
DROP POLICY IF EXISTS "admin_insert_settings" ON public.chawp_app_settings;
DROP POLICY IF EXISTS "admin_update_settings" ON public.chawp_app_settings;

-- Allow admin and super_admin to insert settings (using correct table)
CREATE POLICY "admin_insert_settings" ON public.chawp_app_settings
  FOR INSERT
  WITH CHECK (
    COALESCE(
      (SELECT role FROM public.chawp_user_profiles WHERE id = auth.uid()),
      'user'
    ) IN ('admin', 'super_admin')
  );

-- Allow admin and super_admin to update settings (using correct table)
CREATE POLICY "admin_update_settings" ON public.chawp_app_settings
  FOR UPDATE
  USING (
    COALESCE(
      (SELECT role FROM public.chawp_user_profiles WHERE id = auth.uid()),
      'user'
    ) IN ('admin', 'super_admin')
  );
