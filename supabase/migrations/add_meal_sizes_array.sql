-- Add optional multi-size support for meals while keeping legacy `size`

ALTER TABLE public.chawp_meals
  ADD COLUMN IF NOT EXISTS sizes TEXT[];

-- Ensure legacy single-size field remains optional
ALTER TABLE public.chawp_meals
  ALTER COLUMN size DROP DEFAULT,
  ALTER COLUMN size DROP NOT NULL;

-- Normalize and backfill from legacy single-size field
UPDATE public.chawp_meals
SET sizes = CASE
  WHEN size IS NOT NULL
    AND BTRIM(size) <> ''
    AND LOWER(BTRIM(size)) <> 'medium' THEN ARRAY[LOWER(BTRIM(size))]
  ELSE ARRAY[]::TEXT[]
END
WHERE sizes IS NULL;

-- Ensure values are normalized and empty-safe
UPDATE public.chawp_meals
SET sizes = ARRAY(
  SELECT DISTINCT LOWER(BTRIM(size_value))
  FROM unnest(COALESCE(sizes, ARRAY[]::TEXT[])) AS size_value
  WHERE LOWER(BTRIM(size_value)) IN ('small', 'medium', 'large', 'extra_large')
  ORDER BY LOWER(BTRIM(size_value))
);

UPDATE public.chawp_meals
SET sizes = ARRAY[]::TEXT[]
WHERE sizes IS NULL;

ALTER TABLE public.chawp_meals
  ALTER COLUMN sizes SET DEFAULT ARRAY[]::TEXT[];
