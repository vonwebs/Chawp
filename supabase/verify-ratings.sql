-- SQL Script to Check Vendor Ratings
-- Run this in Supabase SQL Editor to verify ratings are updating

-- 1. Check all vendors and their current ratings
SELECT 
    id,
    name,
    rating as current_rating,
    status
FROM chawp_vendors
ORDER BY rating DESC NULLS LAST;

-- 2. Check reviews for each vendor with calculated average
SELECT 
    v.id as vendor_id,
    v.name as vendor_name,
    v.rating as stored_rating,
    COUNT(r.rating) as review_count,
    ROUND(AVG(r.rating)::DECIMAL, 1) as calculated_average,
    CASE 
        WHEN v.rating = ROUND(AVG(r.rating)::DECIMAL, 1) THEN '✅ MATCHES'
        WHEN v.rating IS NULL AND COUNT(r.rating) = 0 THEN '✅ NO REVIEWS'
        ELSE '❌ MISMATCH'
    END as status
FROM chawp_vendors v
LEFT JOIN chawp_reviews r ON r.vendor_id = v.id AND r.rating IS NOT NULL
GROUP BY v.id, v.name, v.rating
ORDER BY v.name;

-- 3. See all individual reviews
SELECT 
    r.id,
    v.name as vendor_name,
    u.full_name as user_name,
    r.rating,
    r.comment,
    r.created_at
FROM chawp_reviews r
LEFT JOIN chawp_vendors v ON r.vendor_id = v.id
LEFT JOIN chawp_user_profiles u ON r.user_id = u.id
WHERE r.vendor_id IS NOT NULL
ORDER BY r.created_at DESC;

-- 4. Find vendors with mismatched ratings (should be empty after fix)
SELECT 
    v.id,
    v.name,
    v.rating as stored_rating,
    ROUND(AVG(r.rating)::DECIMAL, 1) as should_be
FROM chawp_vendors v
LEFT JOIN chawp_reviews r ON r.vendor_id = v.id AND r.rating IS NOT NULL
GROUP BY v.id, v.name, v.rating
HAVING v.rating != COALESCE(ROUND(AVG(r.rating)::DECIMAL, 1), 0)
   OR (v.rating IS NULL AND COUNT(r.rating) > 0);
