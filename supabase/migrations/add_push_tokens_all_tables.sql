-- Add push_token columns to all relevant tables

-- Add to chawp_vendors table (for vendor notifications)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'chawp_vendors' 
    AND column_name = 'user_id'
  ) THEN
    -- Add user_id column to link vendor to user profile
    ALTER TABLE chawp_vendors ADD COLUMN user_id UUID REFERENCES chawp_user_profiles(id);
    
    -- Create index for faster lookups
    CREATE INDEX IF NOT EXISTS idx_chawp_vendors_user_id 
    ON chawp_vendors(user_id);
  END IF;
END $$;

-- Add to chawp_delivery_personnel table (for delivery notifications)
-- This table should already have user_id linking to chawp_user_profiles
-- Verify the relationship exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'chawp_delivery_personnel' 
    AND column_name = 'user_id'
  ) THEN
    ALTER TABLE chawp_delivery_personnel ADD COLUMN user_id UUID REFERENCES chawp_user_profiles(id);
    
    CREATE INDEX IF NOT EXISTS idx_chawp_delivery_personnel_user_id 
    ON chawp_delivery_personnel(user_id);
  END IF;
END $$;

-- Add to chawp_admin_users table if it exists (for admin notifications)
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.tables 
    WHERE table_name = 'chawp_admin_users'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 
      FROM information_schema.columns 
      WHERE table_name = 'chawp_admin_users' 
      AND column_name = 'push_token'
    ) THEN
      ALTER TABLE chawp_admin_users ADD COLUMN push_token TEXT;
      ALTER TABLE chawp_admin_users ADD COLUMN push_token_updated_at TIMESTAMPTZ;
      
      CREATE INDEX IF NOT EXISTS idx_chawp_admin_users_push_token 
      ON chawp_admin_users(push_token);
    END IF;
  END IF;
END $$;

-- Ensure chawp_user_profiles has push_token (should already exist from previous migration)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'chawp_user_profiles' 
    AND column_name = 'push_token'
  ) THEN
    ALTER TABLE chawp_user_profiles ADD COLUMN push_token TEXT;
    ALTER TABLE chawp_user_profiles ADD COLUMN push_token_updated_at TIMESTAMPTZ;
    
    CREATE INDEX IF NOT EXISTS idx_chawp_user_profiles_push_token 
    ON chawp_user_profiles(push_token);
  END IF;
END $$;

-- Log the updates
DO $$
BEGIN
  RAISE NOTICE 'Push notification columns added/verified for all tables';
END $$;
