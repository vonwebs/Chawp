-- Add size and specifications fields to meals
ALTER TABLE public.chawp_meals
  ADD COLUMN IF NOT EXISTS size TEXT,
  ADD COLUMN IF NOT EXISTS specifications TEXT;

-- Ensure valid size values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chawp_meals_size_check'
      AND conrelid = 'public.chawp_meals'::regclass
  ) THEN
    ALTER TABLE public.chawp_meals
      ADD CONSTRAINT chawp_meals_size_check
      CHECK (size IN ('small', 'medium', 'large', 'extra_large'));
  END IF;
END $$;

-- Keep size optional
ALTER TABLE public.chawp_meals
  ALTER COLUMN size DROP DEFAULT,
  ALTER COLUMN size DROP NOT NULL;

-- Add option price adjustment columns for sizes/specifications
ALTER TABLE public.chawp_meals
  ADD COLUMN IF NOT EXISTS size_prices JSONB DEFAULT '{}'::JSONB NOT NULL,
  ADD COLUMN IF NOT EXISTS specification_prices JSONB DEFAULT '{}'::JSONB NOT NULL;

-- Normalize nullable values for existing rows
UPDATE public.chawp_meals
SET size_prices = '{}'::JSONB
WHERE size_prices IS NULL;

UPDATE public.chawp_meals
SET specification_prices = '{}'::JSONB
WHERE specification_prices IS NULL;
