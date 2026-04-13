-- Add push notification token columns to all user tables

-- Customer users
ALTER TABLE public.chawp_user_profiles
ADD COLUMN IF NOT EXISTS push_token TEXT,
ADD COLUMN IF NOT EXISTS push_token_updated_at TIMESTAMP WITH TIME ZONE;

-- Admin users (create table if doesn't exist)
CREATE TABLE IF NOT EXISTS public.chawp_admin_users (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email TEXT NOT NULL,
    full_name TEXT,
    role TEXT DEFAULT 'admin',
    push_token TEXT,
    push_token_updated_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Enable RLS for admin users
ALTER TABLE public.chawp_admin_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage their own data" ON public.chawp_admin_users;
CREATE POLICY "Admins can manage their own data" ON public.chawp_admin_users
    FOR ALL USING (auth.uid() = id);

-- Delivery personnel
ALTER TABLE public.chawp_delivery_personnel
ADD COLUMN IF NOT EXISTS push_token TEXT,
ADD COLUMN IF NOT EXISTS push_token_updated_at TIMESTAMP WITH TIME ZONE;

-- Vendor users (create table if doesn't exist)
CREATE TABLE IF NOT EXISTS public.chawp_vendor_users (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    vendor_id UUID REFERENCES public.chawp_vendors(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT,
    role TEXT DEFAULT 'vendor',
    push_token TEXT,
    push_token_updated_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Enable RLS for vendor users
ALTER TABLE public.chawp_vendor_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Vendors can manage their own data" ON public.chawp_vendor_users;
CREATE POLICY "Vendors can manage their own data" ON public.chawp_vendor_users
    FOR ALL USING (auth.uid() = id);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_user_profiles_push_token ON public.chawp_user_profiles(push_token);
CREATE INDEX IF NOT EXISTS idx_admin_users_push_token ON public.chawp_admin_users(push_token);
CREATE INDEX IF NOT EXISTS idx_delivery_push_token ON public.chawp_delivery_personnel(push_token);
CREATE INDEX IF NOT EXISTS idx_vendor_users_push_token ON public.chawp_vendor_users(push_token);

-- Create a notification log table to track sent notifications
CREATE TABLE IF NOT EXISTS public.chawp_notification_log (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    recipient_type TEXT NOT NULL CHECK (recipient_type IN ('customer', 'vendor', 'delivery', 'admin')),
    recipient_id UUID NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    data JSONB,
    push_token TEXT,
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    delivery_status TEXT DEFAULT 'sent' CHECK (delivery_status IN ('sent', 'delivered', 'failed')),
    error_message TEXT
);

-- Enable RLS for notification log
ALTER TABLE public.chawp_notification_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own notifications" ON public.chawp_notification_log;
CREATE POLICY "Users can view their own notifications" ON public.chawp_notification_log
    FOR SELECT USING (recipient_id = auth.uid());

DROP POLICY IF EXISTS "Service role can manage notifications" ON public.chawp_notification_log;
CREATE POLICY "Service role can manage notifications" ON public.chawp_notification_log
    FOR ALL USING (auth.role() = 'service_role');
