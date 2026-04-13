-- =============================================
-- CHAWP APP - SAMPLE DATA
-- Date: November 1, 2025
-- Description: Comprehensive sample data for testing the Chawp food delivery app
-- =============================================
-- IMPORTANT: This file inserts sample data for ALL tables
-- Run this AFTER the schema.sql and migration files
-- =============================================

-- =============================================
-- NOTES BEFORE RUNNING
-- =============================================
-- 1. You must have at least ONE authenticated user in auth.users first
-- 2. This script will create sample data for that user
-- 3. All sample data uses realistic values matching the app's design
-- 4. Image URLs are from Unsplash (free to use)
-- 5. Adjust quantities/values as needed for your testing
-- =============================================

-- =============================================
-- 1. VENDORS (8 diverse restaurants)
-- =============================================

INSERT INTO public.chawp_vendors (name, description, image, rating, delivery_time, distance, tags, status, operational_status, address, phone, email)
VALUES
    (
        'Luna Sushi Kitchen',
        'Authentic Japanese sushi and ramen with fresh ingredients delivered nightly',
        'https://images.unsplash.com/photo-1579584425555-c3ce17fd4351?auto=format&fit=crop&w=900&q=80',
        4.8,
        '20-30 min',
        '1.2 km',
        ARRAY['Japanese', 'Sushi', 'Ramen', 'Healthy', 'Popular'],
        'active',
        'open',
        'UPSA Campus, Accra',
        '+233-24-555-0101',
        'info@lunasushi.com'
    ),
    (
        'Burger Boulevard',
        'Gourmet burgers and hand-cut fries made with premium ingredients',
        'https://images.unsplash.com/photo-1571091718767-18b5b1457add?auto=format&fit=crop&w=900&q=80',
        4.6,
        '15-25 min',
        '0.8 km',
        ARRAY['American', 'Burgers', 'Fast Food', 'Comfort Food'],
        'active',
        'open',
        'East Legon, Accra',
        '+233-24-555-0102',
        'hello@burgerblvd.com'
    ),
    (
        'Mama''s Italian Kitchen',
        'Traditional Italian cuisine passed down through generations',
        'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=900&q=80',
        4.7,
        '25-35 min',
        '2.1 km',
        ARRAY['Italian', 'Pizza', 'Pasta', 'Authentic', 'Family'],
        'active',
        'open',
        'Osu, Accra',
        '+233-24-555-0103',
        'family@mamasitalian.com'
    ),
    (
        'Green Garden Cafe',
        'Plant-based cuisine with global influences and fresh organic ingredients',
        'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=900&q=80',
        4.5,
        '18-28 min',
        '1.5 km',
        ARRAY['Vegan', 'Vegetarian', 'Healthy', 'Organic', 'Bowls'],
        'active',
        'open',
        'Cantonments, Accra',
        '+233-24-555-0104',
        'fresh@greengarden.com'
    ),
    (
        'Spice Route',
        'Authentic Indian cuisine with regional specialties from across India',
        'https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=900&q=80',
        4.9,
        '22-32 min',
        '2.8 km',
        ARRAY['Indian', 'Spicy', 'Curry', 'Vegetarian', 'Authentic'],
        'active',
        'open',
        'Airport Residential Area, Accra',
        '+233-24-555-0105',
        'orders@spiceroute.com'
    ),
    (
        'Taco Fiesta',
        'Authentic Mexican street food with fresh salsas and handmade tortillas',
        'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&w=900&q=80',
        4.4,
        '12-22 min',
        '0.5 km',
        ARRAY['Mexican', 'Tacos', 'Burritos', 'Street Food', 'Quick'],
        'active',
        'open',
        'UPSA Campus, Accra',
        '+233-24-555-0106',
        'fiesta@tacofiesta.com'
    ),
    (
        'Golden Dragon',
        'Traditional Chinese cuisine with dim sum and wok-fried specialties',
        'https://images.unsplash.com/photo-1526318896980-cf78c088247c?auto=format&fit=crop&w=900&q=80',
        4.6,
        '20-30 min',
        '1.9 km',
        ARRAY['Chinese', 'Dim Sum', 'Wok', 'Noodles', 'Authentic'],
        'active',
        'open',
        'Madina, Accra',
        '+233-24-555-0107',
        'welcome@goldendragon.com'
    ),
    (
        'Mediterranean Breeze',
        'Fresh Mediterranean cuisine with daily seafood and grilled meats',
        'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=900&q=80',
        4.7,
        '25-35 min',
        '3.2 km',
        ARRAY['Mediterranean', 'Greek', 'Seafood', 'Grilled', 'Fresh'],
        'active',
        'open',
        'Labone, Accra',
        '+233-24-555-0108',
        'info@medbreeze.com'
    )
ON CONFLICT DO NOTHING;

-- =============================================
-- 2. MEALS (30+ diverse menu items)
-- =============================================

-- Luna Sushi Kitchen Items
INSERT INTO public.chawp_meals (vendor_id, title, description, image, price, category, status, tags)
SELECT
    v.id,
    'California Roll (8 pcs)',
    'Classic sushi roll with crab, avocado, and cucumber topped with sesame seeds',
    'https://images.unsplash.com/photo-1579584425555-c3ce17fd4351?auto=format&fit=crop&w=900&q=80',
    12.99,
    'Sushi',
    'available',
    ARRAY['Popular', 'Vegetarian', 'Fresh']
FROM public.chawp_vendors v WHERE v.name = 'Luna Sushi Kitchen'
UNION ALL
SELECT
    v.id,
    'Spicy Tuna Roll (8 pcs)',
    'Fresh tuna mixed with spicy mayo, cucumber, and green onions',
    'https://images.unsplash.com/photo-1617196034183-421b4917c92d?auto=format&fit=crop&w=900&q=80',
    14.99,
    'Sushi',
    'available',
    ARRAY['Spicy', 'Popular', 'Fresh', 'Protein']
FROM public.chawp_vendors v WHERE v.name = 'Luna Sushi Kitchen'
UNION ALL
SELECT
    v.id,
    'Chicken Teriyaki Bowl',
    'Grilled chicken glazed with homemade teriyaki sauce over steamed rice with vegetables',
    'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=900&q=80',
    13.99,
    'Bowls',
    'available',
    ARRAY['Popular', 'Healthy', 'Rice', 'Gluten-free']
FROM public.chawp_vendors v WHERE v.name = 'Luna Sushi Kitchen'
UNION ALL
SELECT
    v.id,
    'Miso Ramen Bowl',
    'Rich miso broth with ramen noodles, soft-boiled egg, pork belly, and vegetables',
    'https://images.unsplash.com/photo-1557872943-16a5ac26437e?auto=format&fit=crop&w=900&q=80',
    15.99,
    'Ramen',
    'available',
    ARRAY['Popular', 'Comfort Food', 'Soup']
FROM public.chawp_vendors v WHERE v.name = 'Luna Sushi Kitchen'
-- Burger Boulevard Items
UNION ALL
SELECT
    v.id,
    'Classic Cheeseburger',
    'Juicy beef patty with aged cheddar, lettuce, tomato, pickles, and special sauce',
    'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=80',
    14.99,
    'Burgers',
    'available',
    ARRAY['Popular', 'Classic', 'Beef']
FROM public.chawp_vendors v WHERE v.name = 'Burger Boulevard'
UNION ALL
SELECT
    v.id,
    'BBQ Bacon Burger',
    'Double beef patty with crispy bacon, BBQ sauce, onion rings, and cheddar',
    'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=900&q=80',
    16.99,
    'Burgers',
    'available',
    ARRAY['Popular', 'BBQ', 'Bacon', 'Indulgent']
FROM public.chawp_vendors v WHERE v.name = 'Burger Boulevard'
UNION ALL
SELECT
    v.id,
    'Veggie Burger',
    'House-made black bean patty with avocado, sprouts, and chipotle aioli',
    'https://images.unsplash.com/photo-1520072959219-c595dc870360?auto=format&fit=crop&w=900&q=80',
    13.99,
    'Burgers',
    'available',
    ARRAY['Vegetarian', 'Healthy', 'Plant-based']
FROM public.chawp_vendors v WHERE v.name = 'Burger Boulevard'
UNION ALL
SELECT
    v.id,
    'Truffle Fries',
    'Hand-cut fries tossed with truffle oil, parmesan, and fresh herbs',
    'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=900&q=80',
    8.99,
    'Sides',
    'available',
    ARRAY['Popular', 'Premium', 'Vegetarian']
FROM public.chawp_vendors v WHERE v.name = 'Burger Boulevard'
-- Mama's Italian Kitchen Items
UNION ALL
SELECT
    v.id,
    'Margherita Pizza (12")',
    'Classic pizza with San Marzano tomatoes, fresh mozzarella, basil, and olive oil',
    'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=900&q=80',
    16.99,
    'Pizza',
    'available',
    ARRAY['Vegetarian', 'Classic', 'Fresh', 'Popular']
FROM public.chawp_vendors v WHERE v.name = 'Mama''s Italian Kitchen'
UNION ALL
SELECT
    v.id,
    'Pepperoni Pizza (12")',
    'Classic pepperoni with mozzarella cheese and tomato sauce on thin crust',
    'https://images.unsplash.com/photo-1628840042765-356cda07504e?auto=format&fit=crop&w=900&q=80',
    18.99,
    'Pizza',
    'available',
    ARRAY['Popular', 'Classic', 'Meat']
FROM public.chawp_vendors v WHERE v.name = 'Mama''s Italian Kitchen'
UNION ALL
SELECT
    v.id,
    'Pasta Carbonara',
    'Creamy pasta with pancetta, eggs, parmesan, and black pepper',
    'https://images.unsplash.com/photo-1612874742237-6526221588e3?auto=format&fit=crop&w=900&q=80',
    15.99,
    'Pasta',
    'available',
    ARRAY['Creamy', 'Classic', 'Italian', 'Popular']
FROM public.chawp_vendors v WHERE v.name = 'Mama''s Italian Kitchen'
UNION ALL
SELECT
    v.id,
    'Lasagna Bolognese',
    'Layers of pasta, rich meat sauce, bechamel, and parmesan cheese',
    'https://images.unsplash.com/photo-1574894709920-11b28e7367e3?auto=format&fit=crop&w=900&q=80',
    17.99,
    'Pasta',
    'available',
    ARRAY['Comfort Food', 'Hearty', 'Family Favorite']
FROM public.chawp_vendors v WHERE v.name = 'Mama''s Italian Kitchen'
-- Green Garden Cafe Items
UNION ALL
SELECT
    v.id,
    'Quinoa Buddha Bowl',
    'Quinoa, roasted vegetables, avocado, chickpeas, and tahini dressing',
    'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=900&q=80',
    12.99,
    'Bowls',
    'available',
    ARRAY['Vegan', 'Healthy', 'Gluten-free', 'Popular']
FROM public.chawp_vendors v WHERE v.name = 'Green Garden Cafe'
UNION ALL
SELECT
    v.id,
    'Falafel Wrap',
    'Crispy falafel with hummus, mixed greens, tomatoes, and tahini sauce',
    'https://images.unsplash.com/photo-1529006557810-274b9b2fc783?auto=format&fit=crop&w=900&q=80',
    11.99,
    'Wraps',
    'available',
    ARRAY['Vegan', 'Mediterranean', 'Healthy', 'Quick']
FROM public.chawp_vendors v WHERE v.name = 'Green Garden Cafe'
UNION ALL
SELECT
    v.id,
    'Acai Smoothie Bowl',
    'Acai blend topped with granola, fresh berries, coconut, and honey',
    'https://images.unsplash.com/photo-1590301157890-4810ed352733?auto=format&fit=crop&w=900&q=80',
    10.99,
    'Bowls',
    'available',
    ARRAY['Vegan', 'Breakfast', 'Healthy', 'Fresh']
FROM public.chawp_vendors v WHERE v.name = 'Green Garden Cafe'
-- Spice Route Items
UNION ALL
SELECT
    v.id,
    'Butter Chicken',
    'Creamy tomato-based curry with tender chicken pieces served with basmati rice',
    'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?auto=format&fit=crop&w=900&q=80',
    15.99,
    'Curry',
    'available',
    ARRAY['Popular', 'Creamy', 'Spicy', 'Rice']
FROM public.chawp_vendors v WHERE v.name = 'Spice Route'
UNION ALL
SELECT
    v.id,
    'Paneer Tikka Masala',
    'Cottage cheese cubes in rich tomato curry with aromatic spices and cream',
    'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?auto=format&fit=crop&w=900&q=80',
    14.99,
    'Curry',
    'available',
    ARRAY['Vegetarian', 'Popular', 'Spicy', 'Creamy']
FROM public.chawp_vendors v WHERE v.name = 'Spice Route'
UNION ALL
SELECT
    v.id,
    'Chicken Biryani',
    'Fragrant basmati rice layered with spiced chicken, saffron, and fried onions',
    'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=900&q=80',
    16.99,
    'Rice',
    'available',
    ARRAY['Popular', 'Spicy', 'Rice', 'Authentic']
FROM public.chawp_vendors v WHERE v.name = 'Spice Route'
UNION ALL
SELECT
    v.id,
    'Samosa Chaat (6 pcs)',
    'Crispy samosas topped with yogurt, chutneys, onions, and spices',
    'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=900&q=80',
    8.99,
    'Appetizers',
    'available',
    ARRAY['Vegetarian', 'Spicy', 'Street Food', 'Popular']
FROM public.chawp_vendors v WHERE v.name = 'Spice Route'
-- Taco Fiesta Items
UNION ALL
SELECT
    v.id,
    'Chicken Tacos (3 pcs)',
    'Soft corn tortillas with grilled chicken, fresh salsa, cilantro, and lime',
    'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&w=900&q=80',
    12.99,
    'Tacos',
    'available',
    ARRAY['Popular', 'Authentic', 'Fresh', 'Gluten-free']
FROM public.chawp_vendors v WHERE v.name = 'Taco Fiesta'
UNION ALL
SELECT
    v.id,
    'Beef Burrito',
    'Large flour tortilla with seasoned beef, rice, beans, cheese, and salsa',
    'https://images.unsplash.com/photo-1626700051175-6818013e1d4f?auto=format&fit=crop&w=900&q=80',
    13.99,
    'Burritos',
    'available',
    ARRAY['Popular', 'Filling', 'Mexican', 'Hearty']
FROM public.chawp_vendors v WHERE v.name = 'Taco Fiesta'
UNION ALL
SELECT
    v.id,
    'Veggie Quesadilla',
    'Grilled tortilla with cheese, peppers, onions, and mushrooms',
    'https://images.unsplash.com/photo-1618040996337-56904b7850b9?auto=format&fit=crop&w=900&q=80',
    11.99,
    'Quesadillas',
    'available',
    ARRAY['Vegetarian', 'Quick', 'Cheesy']
FROM public.chawp_vendors v WHERE v.name = 'Taco Fiesta'
UNION ALL
SELECT
    v.id,
    'Nachos Supreme',
    'Crispy tortilla chips with cheese, beans, jalapenos, sour cream, and guacamole',
    'https://images.unsplash.com/photo-1513456852971-30c0b8199d4d?auto=format&fit=crop&w=900&q=80',
    10.99,
    'Appetizers',
    'available',
    ARRAY['Popular', 'Sharing', 'Vegetarian']
FROM public.chawp_vendors v WHERE v.name = 'Taco Fiesta'
-- Golden Dragon Items
UNION ALL
SELECT
    v.id,
    'Kung Pao Chicken',
    'Spicy stir-fried chicken with peanuts, vegetables, and dried chili peppers',
    'https://images.unsplash.com/photo-1525755662778-989d0524087e?auto=format&fit=crop&w=900&q=80',
    14.99,
    'Stir-fry',
    'available',
    ARRAY['Spicy', 'Popular', 'Authentic', 'Peanuts']
FROM public.chawp_vendors v WHERE v.name = 'Golden Dragon'
UNION ALL
SELECT
    v.id,
    'Vegetable Fried Rice',
    'Wok-tossed rice with mixed vegetables, eggs, and light soy sauce',
    'https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=900&q=80',
    11.99,
    'Rice',
    'available',
    ARRAY['Vegetarian', 'Healthy', 'Quick', 'Rice']
FROM public.chawp_vendors v WHERE v.name = 'Golden Dragon'
UNION ALL
SELECT
    v.id,
    'Sweet & Sour Pork',
    'Crispy pork with bell peppers, pineapple in sweet and tangy sauce',
    'https://images.unsplash.com/photo-1526318896980-cf78c088247c?auto=format&fit=crop&w=900&q=80',
    15.99,
    'Stir-fry',
    'available',
    ARRAY['Popular', 'Sweet', 'Tangy']
FROM public.chawp_vendors v WHERE v.name = 'Golden Dragon'
UNION ALL
SELECT
    v.id,
    'Dim Sum Platter (8 pcs)',
    'Assorted steamed dumplings: shrimp, pork, and vegetable',
    'https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?auto=format&fit=crop&w=900&q=80',
    16.99,
    'Dim Sum',
    'available',
    ARRAY['Popular', 'Sharing', 'Authentic', 'Steamed']
FROM public.chawp_vendors v WHERE v.name = 'Golden Dragon'
-- Mediterranean Breeze Items
UNION ALL
SELECT
    v.id,
    'Grilled Octopus',
    'Fresh octopus grilled with olive oil, lemon, oregano, and served with vegetables',
    'https://images.unsplash.com/photo-1559526324-593bc073d938?auto=format&fit=crop&w=900&q=80',
    18.99,
    'Seafood',
    'available',
    ARRAY['Premium', 'Fresh', 'Mediterranean', 'Grilled']
FROM public.chawp_vendors v WHERE v.name = 'Mediterranean Breeze'
UNION ALL
SELECT
    v.id,
    'Lamb Souvlaki',
    'Marinated lamb skewers with tzatziki sauce, pita bread, and Greek salad',
    'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=900&q=80',
    16.99,
    'Grilled',
    'available',
    ARRAY['Popular', 'Authentic', 'Grilled', 'Protein']
FROM public.chawp_vendors v WHERE v.name = 'Mediterranean Breeze'
UNION ALL
SELECT
    v.id,
    'Greek Salad',
    'Fresh tomatoes, cucumbers, olives, feta cheese, and olive oil dressing',
    'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?auto=format&fit=crop&w=900&q=80',
    9.99,
    'Salads',
    'available',
    ARRAY['Vegetarian', 'Healthy', 'Fresh', 'Gluten-free']
FROM public.chawp_vendors v WHERE v.name = 'Mediterranean Breeze'
ON CONFLICT DO NOTHING;

-- =============================================
-- 3. VENDOR HOURS (All vendors)
-- =============================================
-- Monday-Friday: 9AM-10PM
-- Saturday-Sunday: 10AM-11PM

INSERT INTO public.chawp_vendor_hours (vendor_id, day_of_week, open_time, close_time, is_closed)
SELECT
    v.id,
    day_of_week,
    CASE 
        WHEN day_of_week BETWEEN 1 AND 5 THEN '09:00'::TIME 
        ELSE '10:00'::TIME 
    END as open_time,
    CASE 
        WHEN day_of_week BETWEEN 1 AND 5 THEN '22:00'::TIME 
        ELSE '23:00'::TIME 
    END as close_time,
    FALSE
FROM public.chawp_vendors v
CROSS JOIN generate_series(0, 6) AS day_of_week
ON CONFLICT (vendor_id, day_of_week) DO NOTHING;

-- =============================================
-- 4. SAMPLE USER PROFILE
-- =============================================
-- NOTE: This assumes you have an authenticated user in auth.users
-- Get the first authenticated user and create/update their profile

DO $$
DECLARE
    first_user_id UUID;
BEGIN
    -- Get the first user from auth.users
    SELECT id INTO first_user_id FROM auth.users LIMIT 1;
    
    IF first_user_id IS NOT NULL THEN
        -- Insert or update the user profile
        INSERT INTO public.chawp_user_profiles (id, full_name, username, phone)
        VALUES (
            first_user_id,
            'Test User',
            'testuser',
            '+233-24-123-4567'
        )
        ON CONFLICT (id) DO UPDATE SET
            full_name = EXCLUDED.full_name,
            username = EXCLUDED.username,
            phone = EXCLUDED.phone;
        
        RAISE NOTICE 'User profile created/updated for user: %', first_user_id;
    ELSE
        RAISE NOTICE 'No authenticated users found. Please sign up a user first.';
    END IF;
END $$;

-- =============================================
-- 5. SAMPLE REVIEWS
-- =============================================
-- Add reviews for vendors (requires authenticated user)

DO $$
DECLARE
    sample_user_id UUID;
    luna_id UUID;
    burger_id UUID;
    mama_id UUID;
    green_id UUID;
BEGIN
    -- Get sample user
    SELECT id INTO sample_user_id FROM public.chawp_user_profiles LIMIT 1;
    
    -- Get vendor IDs
    SELECT id INTO luna_id FROM public.chawp_vendors WHERE name = 'Luna Sushi Kitchen';
    SELECT id INTO burger_id FROM public.chawp_vendors WHERE name = 'Burger Boulevard';
    SELECT id INTO mama_id FROM public.chawp_vendors WHERE name = 'Mama''s Italian Kitchen';
    SELECT id INTO green_id FROM public.chawp_vendors WHERE name = 'Green Garden Cafe';
    
    IF sample_user_id IS NOT NULL THEN
        -- Insert sample reviews
        INSERT INTO public.chawp_reviews (user_id, vendor_id, rating, comment)
        VALUES
            (sample_user_id, luna_id, 5, 'Amazing sushi! Fresh ingredients and great service. The California roll is a must-try!'),
            (sample_user_id, burger_id, 4, 'Delicious burgers! The truffle fries are incredible. A bit pricey but worth it.'),
            (sample_user_id, mama_id, 5, 'Best Italian food in Accra! The carbonara is authentic and perfectly creamy.'),
            (sample_user_id, green_id, 4, 'Great healthy options. The Buddha bowl is filling and nutritious.')
        ON CONFLICT DO NOTHING;
        
        RAISE NOTICE 'Sample reviews created for user: %', sample_user_id;
    ELSE
        RAISE NOTICE 'No user profile found. Skipping reviews.';
    END IF;
END $$;

-- =============================================
-- 6. SAMPLE SCHEDULED ORDERS
-- =============================================
-- Create a scheduled order for tomorrow at 12:30 PM (for testing upcoming deliveries)

DO $$
DECLARE
    sample_user_id UUID;
    sample_vendor_id UUID;
    sample_meal_id UUID;
    sample_order_id UUID;
BEGIN
    -- Get sample user and vendor
    SELECT id INTO sample_user_id FROM public.chawp_user_profiles LIMIT 1;
    SELECT id INTO sample_vendor_id FROM public.chawp_vendors WHERE name = 'Luna Sushi Kitchen';
    SELECT id INTO sample_meal_id FROM public.chawp_meals WHERE title LIKE '%California Roll%' LIMIT 1;
    
    IF sample_user_id IS NOT NULL AND sample_vendor_id IS NOT NULL THEN
        -- Create scheduled order for tomorrow at 12:30 PM
        INSERT INTO public.chawp_orders (
            user_id,
            vendor_id,
            total_amount,
            delivery_address,
            delivery_instructions,
            payment_method,
            status,
            scheduled_for
        ) VALUES (
            sample_user_id,
            sample_vendor_id,
            25.99,
            'UPSA Campus, Accra',
            'Call when arriving at main gate',
            'mobile_money',
            'scheduled',
            (NOW() + INTERVAL '1 day')::DATE + TIME '12:30:00'
        )
        RETURNING id INTO sample_order_id;
        
        -- Add order items
        IF sample_meal_id IS NOT NULL THEN
            INSERT INTO public.chawp_order_items (order_id, meal_id, quantity, unit_price)
            VALUES (sample_order_id, sample_meal_id, 2, 12.99);
        END IF;
        
        RAISE NOTICE 'Scheduled order created for tomorrow at 12:30 PM';
    ELSE
        RAISE NOTICE 'Cannot create scheduled order. Missing user or vendor.';
    END IF;
END $$;

-- =============================================
-- 7. SAMPLE COMPLETED ORDER (Order History)
-- =============================================

DO $$
DECLARE
    sample_user_id UUID;
    burger_vendor_id UUID;
    burger_meal_id UUID;
    completed_order_id UUID;
BEGIN
    SELECT id INTO sample_user_id FROM public.chawp_user_profiles LIMIT 1;
    SELECT id INTO burger_vendor_id FROM public.chawp_vendors WHERE name = 'Burger Boulevard';
    SELECT id INTO burger_meal_id FROM public.chawp_meals WHERE title LIKE '%Classic Cheeseburger%' LIMIT 1;
    
    IF sample_user_id IS NOT NULL AND burger_vendor_id IS NOT NULL THEN
        -- Create completed order (3 days ago)
        INSERT INTO public.chawp_orders (
            user_id,
            vendor_id,
            total_amount,
            delivery_address,
            payment_method,
            status,
            created_at
        ) VALUES (
            sample_user_id,
            burger_vendor_id,
            32.48,
            'UPSA Campus, Accra',
            'mobile_money',
            'delivered',
            NOW() - INTERVAL '3 days'
        )
        RETURNING id INTO completed_order_id;
        
        -- Add order items
        IF burger_meal_id IS NOT NULL THEN
            INSERT INTO public.chawp_order_items (order_id, meal_id, quantity, unit_price)
            VALUES (completed_order_id, burger_meal_id, 2, 14.99);
        END IF;
        
        RAISE NOTICE 'Completed order created for order history';
    END IF;
END $$;

-- =============================================
-- VERIFICATION QUERIES
-- =============================================

-- Count all sample data
SELECT 
    'Vendors' as table_name, 
    COUNT(*) as record_count 
FROM public.chawp_vendors
UNION ALL
SELECT 
    'Meals', 
    COUNT(*) 
FROM public.chawp_meals
UNION ALL
SELECT 
    'Vendor Hours', 
    COUNT(*) 
FROM public.chawp_vendor_hours
UNION ALL
SELECT 
    'User Profiles', 
    COUNT(*) 
FROM public.chawp_user_profiles
UNION ALL
SELECT 
    'Reviews', 
    COUNT(*) 
FROM public.chawp_reviews
UNION ALL
SELECT 
    'Orders', 
    COUNT(*) 
FROM public.chawp_orders
UNION ALL
SELECT 
    'Order Items', 
    COUNT(*) 
FROM public.chawp_order_items;

-- Display vendor with meal counts
SELECT 
    v.name,
    v.rating,
    v.delivery_time,
    v.tags,
    COUNT(m.id) as meal_count
FROM public.chawp_vendors v
LEFT JOIN public.chawp_meals m ON m.vendor_id = v.id
GROUP BY v.id, v.name, v.rating, v.delivery_time, v.tags
ORDER BY v.rating DESC;

-- Display meals by category
SELECT 
    category,
    COUNT(*) as meal_count,
    ROUND(AVG(price)::NUMERIC, 2) as avg_price
FROM public.chawp_meals
WHERE category IS NOT NULL
GROUP BY category
ORDER BY meal_count DESC;

-- =============================================
-- SUCCESS MESSAGE
-- =============================================

DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'SAMPLE DATA INSERTED SUCCESSFULLY!';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Summary:';
    RAISE NOTICE '- 8 Vendors with diverse cuisines';
    RAISE NOTICE '- 30+ Menu items across all vendors';
    RAISE NOTICE '- Vendor operating hours (7 days/week)';
    RAISE NOTICE '- Sample reviews from test user';
    RAISE NOTICE '- 1 Scheduled order for tomorrow';
    RAISE NOTICE '- 1 Completed order for history';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Your app is ready for testing!';
    RAISE NOTICE '========================================';
END $$;
