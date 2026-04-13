-- Upgrade meals to support multiple images and multiple specification fields

-- Add images array column when missing
ALTER TABLE public.chawp_meals
  ADD COLUMN IF NOT EXISTS images TEXT[];

-- Ensure specifications is an array column
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'chawp_meals'
      AND column_name = 'specifications'
      AND data_type = 'text'
  ) THEN
    ALTER TABLE public.chawp_meals
      ALTER COLUMN specifications TYPE TEXT[]
      USING CASE
        WHEN specifications IS NULL OR btrim(specifications) = '' THEN ARRAY[]::TEXT[]
        ELSE ARRAY[specifications]
      END;
  ELSIF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'chawp_meals'
      AND column_name = 'specifications'
  ) THEN
    ALTER TABLE public.chawp_meals
      ADD COLUMN specifications TEXT[];
  END IF;
END $$;

-- Backfill images from legacy single-image column
UPDATE public.chawp_meals
SET images = CASE
  WHEN image IS NOT NULL AND btrim(image) <> '' THEN ARRAY[image]
  ELSE ARRAY[]::TEXT[]
END
WHERE images IS NULL OR cardinality(images) = 0;

-- Normalize null specifications and images
UPDATE public.chawp_meals
SET specifications = ARRAY[]::TEXT[]
WHERE specifications IS NULL;

UPDATE public.chawp_meals
SET images = ARRAY[]::TEXT[]
WHERE images IS NULL;

ALTER TABLE public.chawp_meals
  ALTER COLUMN specifications SET DEFAULT ARRAY[]::TEXT[];

ALTER TABLE public.chawp_meals
  ALTER COLUMN images SET DEFAULT ARRAY[]::TEXT[];
