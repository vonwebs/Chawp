-- =============================================
-- CHAWP Food Delivery App Database Schema
-- =============================================
-- This schema defines all tables for the CHAWP food delivery application
-- Built with Supabase PostgreSQL

-- Enable Row Level Security (RLS) for all tables
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- 1. USER PROFILES TABLE
-- =============================================
-- Extends Supabase auth.users with additional profile information
CREATE TABLE IF NOT EXISTS public.chawp_user_profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    full_name TEXT,
    username TEXT UNIQUE,
    avatar_url TEXT,
    phone TEXT,
    address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.chawp_user_profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user profiles
DROP POLICY IF EXISTS "Users can view their own profile" ON public.chawp_user_profiles;
CREATE POLICY "Users can view their own profile" ON public.chawp_user_profiles
    FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.chawp_user_profiles;
CREATE POLICY "Users can update their own profile" ON public.chawp_user_profiles
    FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.chawp_user_profiles;
CREATE POLICY "Users can insert their own profile" ON public.chawp_user_profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

-- Allow service role to manage profiles (for user creation)
DROP POLICY IF EXISTS "Service role can manage profiles" ON public.chawp_user_profiles;
CREATE POLICY "Service role can manage profiles" ON public.chawp_user_profiles
    FOR ALL USING (auth.role() = 'service_role');

-- Allow authenticated users to manage their own profiles
DROP POLICY IF EXISTS "Authenticated users can manage profiles" ON public.chawp_user_profiles;
CREATE POLICY "Authenticated users can manage profiles" ON public.chawp_user_profiles
    FOR ALL USING (auth.role() = 'authenticated');

-- =============================================
-- 2. VENDORS TABLE
-- =============================================
-- Stores restaurant/vendor information
CREATE TABLE IF NOT EXISTS public.chawp_vendors (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    image TEXT,
    rating DECIMAL(3,2) DEFAULT 0.00 CHECK (rating >= 0 AND rating <= 5),
    delivery_time TEXT DEFAULT '25-35 min',
    distance TEXT DEFAULT '1.2 km',
    tags TEXT[] DEFAULT '{}',
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'closed')),
    operational_status TEXT DEFAULT 'open' CHECK (operational_status IN ('open', 'closed')),
    address TEXT,
    phone TEXT,
    email TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.chawp_vendors ENABLE ROW LEVEL SECURITY;

-- RLS Policies for vendors (public read, authenticated write)
DROP POLICY IF EXISTS "Anyone can view vendors" ON public.chawp_vendors;
CREATE POLICY "Anyone can view vendors" ON public.chawp_vendors
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated users can manage vendors" ON public.chawp_vendors;
CREATE POLICY "Authenticated users can manage vendors" ON public.chawp_vendors
    FOR ALL USING (auth.role() = 'authenticated');

-- =============================================
-- 3. MEALS TABLE
-- =============================================
-- Stores food items offered by vendors
CREATE TABLE IF NOT EXISTS public.chawp_meals (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    vendor_id UUID REFERENCES public.chawp_vendors(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    image TEXT,
    images TEXT[] DEFAULT '{}'::TEXT[],
    price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
    category TEXT,
    size TEXT CHECK (size IN ('small', 'medium', 'large', 'extra_large')),
    sizes TEXT[] DEFAULT '{}'::TEXT[],
    specifications TEXT[] DEFAULT '{}'::TEXT[],
    size_prices JSONB DEFAULT '{}'::JSONB NOT NULL,
    specification_prices JSONB DEFAULT '{}'::JSONB NOT NULL,
    status TEXT DEFAULT 'available' CHECK (status IN ('available', 'unavailable', 'discontinued')),
    tags TEXT[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.chawp_meals ENABLE ROW LEVEL SECURITY;

-- RLS Policies for meals (public read, authenticated write)
DROP POLICY IF EXISTS "Anyone can view meals" ON public.chawp_meals;
CREATE POLICY "Anyone can view meals" ON public.chawp_meals
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated users can manage meals" ON public.chawp_meals;
CREATE POLICY "Authenticated users can manage meals" ON public.chawp_meals
    FOR ALL USING (auth.role() = 'authenticated');

-- =============================================
-- 4. CART ITEMS TABLE
-- =============================================
-- Stores user's shopping cart items
CREATE TABLE IF NOT EXISTS public.chawp_cart_items (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.chawp_user_profiles(id) ON DELETE CASCADE NOT NULL,
    meal_id UUID REFERENCES public.chawp_meals(id) ON DELETE CASCADE NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    special_instructions TEXT,
    selected_size TEXT,
    selected_specifications TEXT[] DEFAULT '{}'::TEXT[] NOT NULL,
    options_key TEXT DEFAULT 'none::' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(user_id, meal_id, options_key)
);

-- Enable RLS
ALTER TABLE public.chawp_cart_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for cart items
DROP POLICY IF EXISTS "Authenticated users can manage cart items" ON public.chawp_cart_items;
CREATE POLICY "Authenticated users can manage cart items" ON public.chawp_cart_items
    FOR ALL USING (auth.role() = 'authenticated');

-- =============================================
-- 5. ORDERS TABLE
-- =============================================
-- Stores order information
CREATE TABLE IF NOT EXISTS public.chawp_orders (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.chawp_user_profiles(id) ON DELETE CASCADE NOT NULL,
    vendor_id UUID REFERENCES public.chawp_vendors(id) ON DELETE CASCADE NOT NULL,
    total_amount DECIMAL(10,2) NOT NULL CHECK (total_amount >= 0),
    delivery_address TEXT NOT NULL,
    delivery_instructions TEXT,
    payment_method TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.chawp_orders ENABLE ROW LEVEL SECURITY;

-- RLS Policies for orders
DROP POLICY IF EXISTS "Authenticated users can manage orders" ON public.chawp_orders;
CREATE POLICY "Authenticated users can manage orders" ON public.chawp_orders
    FOR ALL USING (auth.role() = 'authenticated');

-- =============================================
-- 6. ORDER ITEMS TABLE
-- =============================================
-- Stores individual items within an order
CREATE TABLE IF NOT EXISTS public.chawp_order_items (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    order_id UUID REFERENCES public.chawp_orders(id) ON DELETE CASCADE NOT NULL,
    meal_id UUID REFERENCES public.chawp_meals(id) ON DELETE CASCADE NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(10,2) NOT NULL CHECK (unit_price >= 0),
    special_instructions TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.chawp_order_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for order items
DROP POLICY IF EXISTS "Authenticated users can manage order items" ON public.chawp_order_items;
CREATE POLICY "Authenticated users can manage order items" ON public.chawp_order_items
    FOR ALL USING (auth.role() = 'authenticated');

-- =============================================
-- 7. REVIEWS TABLE
-- =============================================
-- Stores ratings and comments for vendors and meals
CREATE TABLE IF NOT EXISTS public.chawp_reviews (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.chawp_user_profiles(id) ON DELETE CASCADE NOT NULL,
    vendor_id UUID REFERENCES public.chawp_vendors(id) ON DELETE CASCADE,
    meal_id UUID REFERENCES public.chawp_meals(id) ON DELETE CASCADE,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    -- Ensure either vendor_id or meal_id is set, but not both
    CONSTRAINT review_target_check CHECK (
        (vendor_id IS NOT NULL AND meal_id IS NULL) OR
        (vendor_id IS NULL AND meal_id IS NOT NULL)
    ),
    -- Unique constraint for user + target
    UNIQUE(user_id, vendor_id),
    UNIQUE(user_id, meal_id)
);

-- Enable RLS
ALTER TABLE public.chawp_reviews ENABLE ROW LEVEL SECURITY;

-- RLS Policies for reviews
DROP POLICY IF EXISTS "Anyone can view reviews" ON public.chawp_reviews;
CREATE POLICY "Anyone can view reviews" ON public.chawp_reviews
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated users can manage reviews" ON public.chawp_reviews;
CREATE POLICY "Authenticated users can manage reviews" ON public.chawp_reviews
    FOR ALL USING (auth.role() = 'authenticated');

-- =============================================
-- 8. VENDOR HOURS TABLE
-- =============================================
-- Stores operating hours for vendors
CREATE TABLE IF NOT EXISTS public.chawp_vendor_hours (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    vendor_id UUID REFERENCES public.chawp_vendors(id) ON DELETE CASCADE NOT NULL,
    day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0=Sunday, 6=Saturday
    open_time TIME NOT NULL,
    close_time TIME NOT NULL,
    is_closed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(vendor_id, day_of_week)
);

-- Enable RLS
ALTER TABLE public.chawp_vendor_hours ENABLE ROW LEVEL SECURITY;

-- RLS Policies for vendor hours (public read, authenticated write)
DROP POLICY IF EXISTS "Anyone can view vendor hours" ON public.chawp_vendor_hours;
CREATE POLICY "Anyone can view vendor hours" ON public.chawp_vendor_hours
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated users can manage vendor hours" ON public.chawp_vendor_hours;
CREATE POLICY "Authenticated users can manage vendor hours" ON public.chawp_vendor_hours
    FOR ALL USING (auth.role() = 'authenticated');

-- =============================================
-- INDEXES FOR PERFORMANCE
-- =============================================

-- User profiles indexes
CREATE INDEX IF NOT EXISTS idx_user_profiles_username ON public.chawp_user_profiles(username);

-- Vendors indexes
CREATE INDEX IF NOT EXISTS idx_vendors_status ON public.chawp_vendors(status);
CREATE INDEX IF NOT EXISTS idx_vendors_rating ON public.chawp_vendors(rating DESC);
CREATE INDEX IF NOT EXISTS idx_vendors_tags ON public.chawp_vendors USING GIN(tags);

-- Meals indexes
CREATE INDEX IF NOT EXISTS idx_meals_vendor_id ON public.chawp_meals(vendor_id);
CREATE INDEX IF NOT EXISTS idx_meals_category ON public.chawp_meals(category);
CREATE INDEX IF NOT EXISTS idx_meals_status ON public.chawp_meals(status);
CREATE INDEX IF NOT EXISTS idx_meals_tags ON public.chawp_meals USING GIN(tags);

-- Cart items indexes
CREATE INDEX IF NOT EXISTS idx_cart_items_user_id ON public.chawp_cart_items(user_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_meal_id ON public.chawp_cart_items(meal_id);

-- Orders indexes
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.chawp_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_vendor_id ON public.chawp_orders(vendor_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.chawp_orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.chawp_orders(created_at DESC);

-- Order items indexes
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.chawp_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_meal_id ON public.chawp_order_items(meal_id);

-- Reviews indexes
CREATE INDEX IF NOT EXISTS idx_reviews_vendor_id ON public.chawp_reviews(vendor_id);
CREATE INDEX IF NOT EXISTS idx_reviews_meal_id ON public.chawp_reviews(meal_id);
CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON public.chawp_reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_rating ON public.chawp_reviews(rating);

-- Vendor hours indexes
CREATE INDEX IF NOT EXISTS idx_vendor_hours_vendor_id ON public.chawp_vendor_hours(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_hours_day_of_week ON public.chawp_vendor_hours(day_of_week);

-- =============================================
-- TRIGGERS FOR UPDATED_AT
-- =============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    -- Only update if this is an UPDATE operation, not INSERT
    IF TG_OP = 'UPDATE' THEN
        NEW.updated_at = TIMEZONE('utc'::text, NOW());
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers to relevant tables
DROP TRIGGER IF EXISTS handle_updated_at_user_profiles ON public.chawp_user_profiles;
CREATE TRIGGER handle_updated_at_user_profiles
    BEFORE UPDATE ON public.chawp_user_profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS handle_updated_at_vendors ON public.chawp_vendors;
CREATE TRIGGER handle_updated_at_vendors
    BEFORE UPDATE ON public.chawp_vendors
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS handle_updated_at_meals ON public.chawp_meals;
CREATE TRIGGER handle_updated_at_meals
    BEFORE UPDATE ON public.chawp_meals
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS handle_updated_at_cart_items ON public.chawp_cart_items;
CREATE TRIGGER handle_updated_at_cart_items
    BEFORE UPDATE ON public.chawp_cart_items
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS handle_updated_at_orders ON public.chawp_orders;
CREATE TRIGGER handle_updated_at_orders
    BEFORE UPDATE ON public.chawp_orders
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS handle_updated_at_reviews ON public.chawp_reviews;
CREATE TRIGGER handle_updated_at_reviews
    BEFORE UPDATE ON public.chawp_reviews
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS handle_updated_at_vendor_hours ON public.chawp_vendor_hours;
CREATE TRIGGER handle_updated_at_vendor_hours
    BEFORE UPDATE ON public.chawp_vendor_hours
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- =============================================
-- FUNCTIONS FOR BUSINESS LOGIC
-- =============================================

-- Function to get average rating for a vendor or meal
CREATE OR REPLACE FUNCTION public.get_average_rating(target_type TEXT, target_id UUID)
RETURNS TABLE(average_rating DECIMAL, review_count BIGINT) AS $$
BEGIN
    IF target_type = 'vendor' THEN
        RETURN QUERY
        SELECT
            ROUND(AVG(rating)::DECIMAL, 1) as average_rating,
            COUNT(*) as review_count
        FROM public.chawp_reviews
        WHERE vendor_id = target_id AND rating IS NOT NULL;
    ELSIF target_type = 'meal' THEN
        RETURN QUERY
        SELECT
            ROUND(AVG(rating)::DECIMAL, 1) as average_rating,
            COUNT(*) as review_count
        FROM public.chawp_reviews
        WHERE meal_id = target_id AND rating IS NOT NULL;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if vendor is currently open
CREATE OR REPLACE FUNCTION public.is_vendor_open(vendor_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
    current_day INTEGER;
    now_time TIME;
    vendor_status TEXT;
    hours_record RECORD;
BEGIN
    -- Get current day and time
    current_day := EXTRACT(DOW FROM NOW());
    now_time := NOW()::TIME;

    -- Check vendor operational status
    SELECT operational_status INTO vendor_status
    FROM public.chawp_vendors
    WHERE id = vendor_uuid;

    IF vendor_status = 'closed' THEN
        RETURN FALSE;
    END IF;

    -- Check operating hours
    SELECT * INTO hours_record
    FROM public.chawp_vendor_hours
    WHERE vendor_id = vendor_uuid
      AND day_of_week = current_day
      AND is_closed = FALSE;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    RETURN now_time BETWEEN hours_record.open_time AND hours_record.close_time;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- MIGRATION: Update Foreign Key Relationships
-- =============================================
-- These ALTER TABLE statements update existing tables to use the correct foreign key references
-- Run these after the main schema if you have existing tables

-- Update cart_items foreign key
ALTER TABLE public.chawp_cart_items
DROP CONSTRAINT IF EXISTS chawp_cart_items_user_id_fkey,
ADD CONSTRAINT chawp_cart_items_user_id_fkey
FOREIGN KEY (user_id) REFERENCES public.chawp_user_profiles(id) ON DELETE CASCADE;

-- Update orders foreign key
ALTER TABLE public.chawp_orders
DROP CONSTRAINT IF EXISTS chawp_orders_user_id_fkey,
ADD CONSTRAINT chawp_orders_user_id_fkey
FOREIGN KEY (user_id) REFERENCES public.chawp_user_profiles(id) ON DELETE CASCADE;

-- Update reviews foreign key
ALTER TABLE public.chawp_reviews
DROP CONSTRAINT IF EXISTS chawp_reviews_user_id_fkey,
ADD CONSTRAINT chawp_reviews_user_id_fkey
FOREIGN KEY (user_id) REFERENCES public.chawp_user_profiles(id) ON DELETE CASCADE;

-- Insert sample vendors
INSERT INTO public.chawp_vendors (name, description, rating, delivery_time, distance, tags, status, address, phone, email)
VALUES
    ('Luna Sushi Kitchen', 'Authentic Japanese sushi and ramen with fresh ingredients', 4.8, '20-30 min', '1.2 km', ARRAY['Japanese', 'Sushi', 'Ramen', 'Healthy'], 'active', '123 Sakura Street, Downtown', '+1-555-0101', 'info@lunasushi.com'),
    ('Burger Boulevard', 'Gourmet burgers and hand-cut fries made with premium ingredients', 4.6, '15-25 min', '0.8 km', ARRAY['American', 'Burgers', 'Fast Food', 'Comfort Food'], 'active', '456 Main Street, Midtown', '+1-555-0102', 'hello@burgerblvd.com'),
    ('Mama''s Italian Kitchen', 'Traditional Italian cuisine passed down through generations', 4.7, '25-35 min', '2.1 km', ARRAY['Italian', 'Pizza', 'Pasta', 'Authentic'], 'active', '789 Olive Avenue, Little Italy', '+1-555-0103', 'family@mamasitalian.com'),
    ('Green Garden Cafe', 'Plant-based cuisine with global influences and fresh organic ingredients', 4.5, '18-28 min', '1.5 km', ARRAY['Vegan', 'Vegetarian', 'Healthy', 'Organic'], 'active', '321 Garden Lane, Eco District', '+1-555-0104', 'fresh@greengarden.com'),
    ('Spice Route', 'Authentic Indian cuisine with regional specialties from across India', 4.9, '22-32 min', '2.8 km', ARRAY['Indian', 'Spicy', 'Curry', 'Vegetarian'], 'active', '654 Spice Market Road, Cultural Quarter', '+1-555-0105', 'orders@spiceroute.com'),
    ('Taco Fiesta', 'Authentic Mexican street food with fresh salsas and handmade tortillas', 4.4, '12-22 min', '0.5 km', ARRAY['Mexican', 'Tacos', 'Burritos', 'Street Food'], 'active', '987 Fiesta Plaza, Market District', '+1-555-0106', 'fiesta@tacofiesta.com'),
    ('Golden Dragon', 'Traditional Chinese cuisine with dim sum and wok-fried specialties', 4.6, '20-30 min', '1.9 km', ARRAY['Chinese', 'Dim Sum', 'Wok', 'Noodles'], 'active', '147 Dragon Gate Boulevard, Chinatown', '+1-555-0107', 'welcome@goldendragon.com'),
    ('Mediterranean Breeze', 'Fresh Mediterranean cuisine with daily seafood and grilled meats', 4.7, '25-35 min', '3.2 km', ARRAY['Mediterranean', 'Greek', 'Seafood', 'Grilled'], 'active', '258 Aegean Coast Drive, Waterfront', '+1-555-0108', 'info@medbreeze.com')
ON CONFLICT DO NOTHING;

-- Insert sample meals
INSERT INTO public.chawp_meals (vendor_id, title, description, price, category, tags, status)
SELECT
    v.id,
    'California Roll',
    'Crab, avocado, and cucumber roll with sesame seeds',
    12.99,
    'Sushi',
    ARRAY['Popular', 'Vegetarian', 'Fresh'],
    'available'
FROM public.chawp_vendors v WHERE v.name = 'Luna Sushi Kitchen'
UNION ALL
SELECT
    v.id,
    'Spicy Tuna Roll',
    'Fresh tuna with spicy mayo and green onions',
    14.99,
    'Sushi',
    ARRAY['Spicy', 'Popular', 'Fresh'],
    'available'
FROM public.chawp_vendors v WHERE v.name = 'Luna Sushi Kitchen'
UNION ALL
SELECT
    v.id,
    'Chicken Teriyaki Bowl',
    'Grilled chicken with teriyaki sauce over steamed rice',
    13.99,
    'Bowls',
    ARRAY['Popular', 'Healthy', 'Rice'],
    'available'
FROM public.chawp_vendors v WHERE v.name = 'Luna Sushi Kitchen'
UNION ALL
SELECT
    v.id,
    'Classic Cheeseburger',
    'Beef patty with cheese, lettuce, tomato, and special sauce',
    14.99,
    'Burgers',
    ARRAY['Popular', 'Classic', 'Beef'],
    'available'
FROM public.chawp_vendors v WHERE v.name = 'Burger Boulevard'
UNION ALL
SELECT
    v.id,
    'BBQ Bacon Burger',
    'Beef patty with bacon, BBQ sauce, and onion rings',
    16.99,
    'Burgers',
    ARRAY['Popular', 'BBQ', 'Bacon'],
    'available'
FROM public.chawp_vendors v WHERE v.name = 'Burger Boulevard'
UNION ALL
SELECT
    v.id,
    'Veggie Burger',
    'House-made black bean patty with avocado and sprouts',
    13.99,
    'Burgers',
    ARRAY['Vegetarian', 'Healthy', 'Plant-based'],
    'available'
FROM public.chawp_vendors v WHERE v.name = 'Burger Boulevard'
UNION ALL
SELECT
    v.id,
    'Margherita Pizza',
    'Fresh mozzarella, tomato sauce, and basil on thin crust',
    16.99,
    'Pizza',
    ARRAY['Vegetarian', 'Classic', 'Fresh'],
    'available'
FROM public.chawp_vendors v WHERE v.name = 'Mama''s Italian Kitchen'
UNION ALL
SELECT
    v.id,
    'Pepperoni Pizza',
    'Classic pepperoni with mozzarella and tomato sauce',
    18.99,
    'Pizza',
    ARRAY['Popular', 'Classic', 'Meat'],
    'available'
FROM public.chawp_vendors v WHERE v.name = 'Mama''s Italian Kitchen'
UNION ALL
SELECT
    v.id,
    'Pasta Carbonara',
    'Creamy pasta with pancetta, eggs, and parmesan',
    15.99,
    'Pasta',
    ARRAY['Creamy', 'Classic', 'Italian'],
    'available'
FROM public.chawp_vendors v WHERE v.name = 'Mama''s Italian Kitchen'
UNION ALL
SELECT
    v.id,
    'Quinoa Buddha Bowl',
    'Quinoa, roasted vegetables, avocado, and tahini dressing',
    12.99,
    'Bowls',
    ARRAY['Vegan', 'Healthy', 'Gluten-free'],
    'available'
FROM public.chawp_vendors v WHERE v.name = 'Green Garden Cafe'
UNION ALL
SELECT
    v.id,
    'Falafel Wrap',
    'Crispy falafel with hummus, veggies, and tzatziki',
    11.99,
    'Wraps',
    ARRAY['Vegan', 'Mediterranean', 'Healthy'],
    'available'
FROM public.chawp_vendors v WHERE v.name = 'Green Garden Cafe'
UNION ALL
SELECT
    v.id,
    'Butter Chicken',
    'Creamy tomato-based curry with tender chicken and basmati rice',
    15.99,
    'Curry',
    ARRAY['Popular', 'Creamy', 'Spicy'],
    'available'
FROM public.chawp_vendors v WHERE v.name = 'Spice Route'
UNION ALL
SELECT
    v.id,
    'Paneer Tikka Masala',
    'Cottage cheese in rich tomato curry with aromatic spices',
    14.99,
    'Curry',
    ARRAY['Vegetarian', 'Popular', 'Spicy'],
    'available'
FROM public.chawp_vendors v WHERE v.name = 'Spice Route'
UNION ALL
SELECT
    v.id,
    'Chicken Tacos (3 pcs)',
    'Soft corn tortillas with grilled chicken, salsa, and cilantro',
    12.99,
    'Tacos',
    ARRAY['Popular', 'Authentic', 'Fresh'],
    'available'
FROM public.chawp_vendors v WHERE v.name = 'Taco Fiesta'
UNION ALL
SELECT
    v.id,
    'Beef Burrito',
    'Large flour tortilla with seasoned beef, rice, beans, and salsa',
    13.99,
    'Burritos',
    ARRAY['Popular', 'Filling', 'Mexican'],
    'available'
FROM public.chawp_vendors v WHERE v.name = 'Taco Fiesta'
UNION ALL
SELECT
    v.id,
    'Kung Pao Chicken',
    'Spicy stir-fried chicken with peanuts, vegetables, and chili peppers',
    14.99,
    'Stir-fry',
    ARRAY['Spicy', 'Popular', 'Authentic'],
    'available'
FROM public.chawp_vendors v WHERE v.name = 'Golden Dragon'
UNION ALL
SELECT
    v.id,
    'Vegetable Fried Rice',
    'Wok-tossed rice with mixed vegetables and light soy sauce',
    11.99,
    'Rice',
    ARRAY['Vegetarian', 'Healthy', 'Quick'],
    'available'
FROM public.chawp_vendors v WHERE v.name = 'Golden Dragon'
UNION ALL
SELECT
    v.id,
    'Grilled Octopus',
    'Fresh octopus grilled with olive oil, lemon, and herbs',
    18.99,
    'Seafood',
    ARRAY['Premium', 'Fresh', 'Mediterranean'],
    'available'
FROM public.chawp_vendors v WHERE v.name = 'Mediterranean Breeze'
UNION ALL
SELECT
    v.id,
    'Lamb Souvlaki',
    'Marinated lamb skewers with tzatziki and pita bread',
    16.99,
    'Grilled',
    ARRAY['Popular', 'Authentic', 'Grilled'],
    'available'
FROM public.chawp_vendors v WHERE v.name = 'Mediterranean Breeze'
ON CONFLICT DO NOTHING;

-- Insert sample vendor hours (Monday-Friday 9AM-10PM, Saturday-Sunday 10AM-11PM)
INSERT INTO public.chawp_vendor_hours (vendor_id, day_of_week, open_time, close_time, is_closed)
SELECT
    v.id,
    day_of_week,
    CASE WHEN day_of_week BETWEEN 1 AND 5 THEN '09:00'::TIME ELSE '10:00'::TIME END,
    CASE WHEN day_of_week BETWEEN 1 AND 5 THEN '22:00'::TIME ELSE '23:00'::TIME END,
    FALSE
FROM public.chawp_vendors v
CROSS JOIN generate_series(0, 6) AS day_of_week
ON CONFLICT DO NOTHING;
