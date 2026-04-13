-- Hero cards table for Chawp

CREATE TABLE IF NOT EXISTS public.chawp_hero_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL,
  button_text TEXT DEFAULT 'Learn More',
  icon TEXT DEFAULT 'arrow-forward',
  image_url TEXT NOT NULL,
  gradient_start TEXT,
  gradient_end TEXT,
  action_type TEXT CHECK (action_type IN ('navigate', 'whatsapp', 'url')) DEFAULT 'navigate',
  action_value TEXT,
  whatsapp_number TEXT,
  whatsapp_message TEXT,
  order_index INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hero_cards_order ON public.chawp_hero_cards(order_index);
CREATE INDEX IF NOT EXISTS idx_hero_cards_active ON public.chawp_hero_cards(is_active);

-- Optional: trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS hero_cards_set_updated_at ON public.chawp_hero_cards;
CREATE TRIGGER hero_cards_set_updated_at
BEFORE UPDATE ON public.chawp_hero_cards
FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
