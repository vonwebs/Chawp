# Vendor Rating Update Issue - Fixed

## Problem

Vendor ratings were not being updated in the `chawp_vendors` table when users submitted reviews. Reviews were being stored in the `chawp_reviews` table, but the aggregate rating in the vendor's record was not being recalculated.

## Root Cause

There was no mechanism to automatically update the `chawp_vendors.rating` field when new reviews were added, updated, or deleted.

## Solution (Application-Level)

**✅ IMPLEMENTED IN CODE** - Added automatic rating update in `api.js`:

When a vendor review with a rating is submitted:

1. Review is saved to `chawp_reviews` table
2. `updateVendorRating()` function is automatically called
3. Function calculates average rating from all vendor reviews
4. Updates `chawp_vendors.rating` field with new average
5. Rounds to 1 decimal place (e.g., 4.5)

**Code Changes:**

- Modified `submitComment()` in `src/services/api.js` to call rating update
- Added `updateVendorRating()` helper function

## Alternative Solution (Database-Level)

For better performance at scale, you can also implement a database trigger:

### Files Available

- `add-rating-trigger.sql` - Contains the trigger function and trigger creation

## How to Apply the Fix

### Option 1: Run SQL in Supabase Dashboard

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Copy the contents of `add-rating-trigger.sql`
4. Paste and click **Run**

### Option 2: Run via Supabase CLI

```bash
supabase db execute --file supabase/add-rating-trigger.sql
```

## What the Trigger Does

1. **Creates a function** (`update_vendor_rating()`) that:

   - Calculates the average rating from all reviews for a vendor
   - Counts the number of reviews
   - Updates the `chawp_vendors.rating` field with the new average
   - Handles INSERT, UPDATE, and DELETE operations

2. **Creates a trigger** that fires:

   - After any INSERT, UPDATE, or DELETE on `chawp_reviews`
   - Only for vendor reviews (ignores meal reviews)
   - Automatically recalculates the vendor's rating

3. **Updates existing data** (one-time sync):
   - Recalculates ratings for all existing vendors based on their current reviews

## Testing the Application-Level Fix

**✅ No database changes needed - the fix is already in your code!**

1. **Test with a new review:**

   - Submit a review for a vendor in the app (with a rating 1-5 stars)
   - The `submitComment()` function will automatically update the vendor's rating
   - Check the `chawp_vendors` table - the `rating` field should be updated immediately
   - Check the `chawp_reviews` table to verify the review was saved

2. **What happens:**

   - Review is saved to `chawp_reviews`
   - App calculates average of all vendor ratings
   - App updates `chawp_vendors.rating` field automatically
   - New rating is rounded to 1 decimal (e.g., 4.3, 4.7)

3. **Important notes:**
   - Only vendor reviews with ratings trigger the update
   - Comments without ratings don't update the vendor rating
   - Submit a meal review - vendor rating should NOT change (only vendor reviews update vendor ratings)

## Testing the Database Trigger (Optional)

If you also want to implement the database-level trigger for better performance:

## Database Schema Reference

**chawp_reviews table:**

- `id` - UUID (primary key)
- `user_id` - UUID (foreign key to chawp_user_profiles)
- `vendor_id` - UUID (foreign key to chawp_vendors) - nullable
- `meal_id` - UUID (foreign key to chawp_meals) - nullable
- `rating` - INTEGER (1-5 stars) - nullable
- `comment` - TEXT

**chawp_vendors table:**

- `id` - UUID (primary key)
- `rating` - DECIMAL - **THIS FIELD NOW AUTO-UPDATES**
- Other fields...

## Code Flow After Fix

**Application-Level (Current Implementation):**

1. User submits review via `CommentsSection.js` component
2. `submitComment()` in `api.js` saves record to `chawp_reviews`
3. **`updateVendorRating()` function automatically executes**
4. Function calculates new average rating from all vendor reviews
5. Function updates `chawp_vendors.rating` field
6. App displays updated rating on next vendor data fetch

**Database-Level (Optional Enhancement):**

1. User submits review via `CommentsSection.js` component
2. `submitComment()` in `api.js` inserts/updates record in `chawp_reviews`
3. **Database trigger automatically fires**
4. Trigger calculates new average rating from all vendor reviews
5. Trigger updates `chawp_vendors.rating` field
6. App displays updated rating immediately on next vendor data fetch

## Notes

- The trigger uses `SECURITY DEFINER` to ensure it has permission to update the vendors table
- Ratings are rounded to 1 decimal place (e.g., 4.5)
- If a vendor has no reviews, their rating is set to 0
- The trigger only processes vendor reviews (vendor_id IS NOT NULL)
- Meal reviews are stored separately and don't affect vendor ratings
