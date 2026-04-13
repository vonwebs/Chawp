-- Add WhatsApp fields to chawp_hero_cards table
-- Migration: Add whatsapp_number and whatsapp_message columns

ALTER TABLE public.chawp_hero_cards
ADD COLUMN IF NOT EXISTS whatsapp_number TEXT,
ADD COLUMN IF NOT EXISTS whatsapp_message TEXT;

-- Add comment for documentation
COMMENT ON COLUMN public.chawp_hero_cards.whatsapp_number IS 'Owner WhatsApp account number (with country code, e.g., +1234567890)';
COMMENT ON COLUMN public.chawp_hero_cards.whatsapp_message IS 'Message template to send to owner when user clicks WhatsApp button';
-- Enable Row Level Security
ALTER TABLE public.chawp_hero_cards ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Public can view active hero cards" ON public.chawp_hero_cards;
DROP POLICY IF EXISTS "Admins can view all hero cards" ON public.chawp_hero_cards;
DROP POLICY IF EXISTS "Only admins can insert hero cards" ON public.chawp_hero_cards;
DROP POLICY IF EXISTS "Only admins can update hero cards" ON public.chawp_hero_cards;
DROP POLICY IF EXISTS "Only admins can delete hero cards" ON public.chawp_hero_cards;

-- Public read policy: Anyone can view active hero cards
CREATE POLICY "Public can view active hero cards"
ON public.chawp_hero_cards
FOR SELECT
USING (is_active = true);

-- Admin/Super admin read policy: Admins and super admins can view all hero cards (including inactive)
CREATE POLICY "Admins can view all hero cards"
ON public.chawp_hero_cards
FOR SELECT
USING (
  auth.uid() IN (
    SELECT id FROM public.chawp_user_profiles 
    WHERE role IN ('admin', 'super_admin')
  )
);

-- Admin/Super admin insert policy
CREATE POLICY "Only admins can insert hero cards"
ON public.chawp_hero_cards
FOR INSERT
WITH CHECK (
  auth.uid() IN (
    SELECT id FROM public.chawp_user_profiles 
    WHERE role IN ('admin', 'super_admin')
  )
);

-- Admin/Super admin update policy
CREATE POLICY "Only admins can update hero cards"
ON public.chawp_hero_cards
FOR UPDATE
USING (
  auth.uid() IN (
    SELECT id FROM public.chawp_user_profiles 
    WHERE role IN ('admin', 'super_admin')
  )
)
WITH CHECK (
  auth.uid() IN (
    SELECT id FROM public.chawp_user_profiles 
    WHERE role IN ('admin', 'super_admin')
  )
);

-- Admin/Super admin delete policy
CREATE POLICY "Only admins can delete hero cards"
ON public.chawp_hero_cards
FOR DELETE
USING (
  auth.uid() IN (
    SELECT id FROM public.chawp_user_profiles 
    WHERE role IN ('admin', 'super_admin')
  )
);