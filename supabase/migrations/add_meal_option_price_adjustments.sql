-- Add configurable price adjustments for meal size and specification options.
ALTER TABLE public.chawp_meals
  ADD COLUMN IF NOT EXISTS size_prices JSONB DEFAULT '{}'::JSONB NOT NULL,
  ADD COLUMN IF NOT EXISTS specification_prices JSONB DEFAULT '{}'::JSONB NOT NULL;

-- Normalize nullable values for older rows.
UPDATE public.chawp_meals
SET size_prices = '{}'::JSONB
WHERE size_prices IS NULL;

UPDATE public.chawp_meals
SET specification_prices = '{}'::JSONB
WHERE specification_prices IS NULL;
