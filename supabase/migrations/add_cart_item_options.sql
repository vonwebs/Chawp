-- Add cart item options so each meal variant (size/specs) is stored separately

ALTER TABLE public.chawp_cart_items
  ADD COLUMN IF NOT EXISTS selected_size TEXT,
  ADD COLUMN IF NOT EXISTS selected_specifications TEXT[],
  ADD COLUMN IF NOT EXISTS options_key TEXT;

-- Backfill selected_size using existing meal size when available
UPDATE public.chawp_cart_items AS c
SET selected_size = COALESCE(
  NULLIF(LOWER(BTRIM(c.selected_size)), ''),
  NULLIF(LOWER(BTRIM(m.size)), '')
)
FROM public.chawp_meals AS m
WHERE c.meal_id = m.id;

-- Normalize specifications into a sorted, deduplicated text array
UPDATE public.chawp_cart_items
SET selected_specifications = ARRAY(
  SELECT DISTINCT BTRIM(spec)
  FROM unnest(COALESCE(selected_specifications, ARRAY[]::TEXT[])) AS spec
  WHERE BTRIM(spec) <> ''
  ORDER BY BTRIM(spec)
);

-- Normalize blank size values to null
UPDATE public.chawp_cart_items
SET selected_size = NULL
WHERE selected_size IS NOT NULL AND BTRIM(selected_size) = '';

UPDATE public.chawp_cart_items
SET selected_specifications = ARRAY[]::TEXT[]
WHERE selected_specifications IS NULL;

-- Build a canonical options key: <size>::<spec1|spec2|...>
UPDATE public.chawp_cart_items
SET options_key = COALESCE(NULLIF(LOWER(BTRIM(selected_size)), ''), 'none') || '::' || ARRAY_TO_STRING(
  ARRAY(
    SELECT BTRIM(spec)
    FROM unnest(COALESCE(selected_specifications, ARRAY[]::TEXT[])) AS spec
    WHERE BTRIM(spec) <> ''
    ORDER BY BTRIM(spec)
  ),
  '|'
);

ALTER TABLE public.chawp_cart_items
  ALTER COLUMN selected_size DROP DEFAULT,
  ALTER COLUMN selected_size DROP NOT NULL,
  ALTER COLUMN selected_specifications SET DEFAULT ARRAY[]::TEXT[],
  ALTER COLUMN selected_specifications SET NOT NULL,
  ALTER COLUMN options_key SET DEFAULT 'none::',
  ALTER COLUMN options_key SET NOT NULL;

-- Replace old unique constraint (user_id, meal_id) with option-aware uniqueness
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chawp_cart_items_user_id_meal_id_key'
      AND conrelid = 'public.chawp_cart_items'::regclass
  ) THEN
    ALTER TABLE public.chawp_cart_items
      DROP CONSTRAINT chawp_cart_items_user_id_meal_id_key;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chawp_cart_items_user_meal_options_key'
      AND conrelid = 'public.chawp_cart_items'::regclass
  ) THEN
    ALTER TABLE public.chawp_cart_items
      ADD CONSTRAINT chawp_cart_items_user_meal_options_key
      UNIQUE (user_id, meal_id, options_key);
  END IF;
END $$;
