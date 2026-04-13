-- Make meal size optional and align cart option keys for no-size variants

ALTER TABLE public.chawp_meals
	ALTER COLUMN size DROP DEFAULT,
	ALTER COLUMN size DROP NOT NULL;

ALTER TABLE public.chawp_cart_items
	ALTER COLUMN selected_size DROP DEFAULT,
	ALTER COLUMN selected_size DROP NOT NULL;

UPDATE public.chawp_cart_items
SET selected_size = NULL
WHERE selected_size IS NOT NULL AND BTRIM(selected_size) = '';

UPDATE public.chawp_cart_items
SET selected_specifications = ARRAY(
	SELECT DISTINCT BTRIM(spec)
	FROM unnest(COALESCE(selected_specifications, ARRAY[]::TEXT[])) AS spec
	WHERE BTRIM(spec) <> ''
	ORDER BY BTRIM(spec)
);

UPDATE public.chawp_cart_items
SET selected_specifications = ARRAY[]::TEXT[]
WHERE selected_specifications IS NULL;

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
	ALTER COLUMN selected_specifications SET DEFAULT ARRAY[]::TEXT[],
	ALTER COLUMN selected_specifications SET NOT NULL,
	ALTER COLUMN options_key SET DEFAULT 'none::',
	ALTER COLUMN options_key SET NOT NULL;
