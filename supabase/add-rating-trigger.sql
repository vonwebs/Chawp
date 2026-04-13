-- Function to update vendor rating when reviews change
CREATE OR REPLACE FUNCTION public.update_vendor_rating()
RETURNS TRIGGER AS $$
DECLARE
    vendor_uuid UUID;
    avg_rating DECIMAL;
    review_cnt BIGINT;
BEGIN
    -- Determine the vendor_id from the NEW or OLD record
    IF TG_OP = 'DELETE' THEN
        vendor_uuid := OLD.vendor_id;
    ELSE
        vendor_uuid := NEW.vendor_id;
    END IF;

    -- Only process if this is a vendor review (not a meal review)
    IF vendor_uuid IS NOT NULL THEN
        -- Calculate the new average rating and count
        SELECT 
            ROUND(AVG(rating)::DECIMAL, 1),
            COUNT(*)
        INTO avg_rating, review_cnt
        FROM public.chawp_reviews
        WHERE vendor_id = vendor_uuid AND rating IS NOT NULL;

        -- Update the vendor's rating field
        UPDATE public.chawp_vendors
        SET 
            rating = COALESCE(avg_rating, 0),
            updated_at = NOW()
        WHERE id = vendor_uuid;
    END IF;

    -- Return the appropriate record
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to update vendor rating on review changes
DROP TRIGGER IF EXISTS update_vendor_rating_trigger ON public.chawp_reviews;
CREATE TRIGGER update_vendor_rating_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.chawp_reviews
    FOR EACH ROW
    EXECUTE FUNCTION public.update_vendor_rating();

-- Optionally, update all existing vendor ratings to reflect current reviews
-- Run this once to sync existing data
UPDATE public.chawp_vendors v
SET rating = COALESCE((
    SELECT ROUND(AVG(rating)::DECIMAL, 1)
    FROM public.chawp_reviews
    WHERE vendor_id = v.id AND rating IS NOT NULL
), 0);
