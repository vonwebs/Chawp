-- Add email column to chawp_user_profiles if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'chawp_user_profiles' 
    AND column_name = 'email'
  ) THEN
    ALTER TABLE chawp_user_profiles ADD COLUMN email TEXT;
    
    -- Create index for faster email lookups
    CREATE INDEX IF NOT EXISTS idx_chawp_user_profiles_email 
    ON chawp_user_profiles(email);
  END IF;
END $$;

-- Update existing profiles with email from auth.users
UPDATE chawp_user_profiles up
SET email = au.email
FROM auth.users au
WHERE up.id = au.id
AND (up.email IS NULL OR up.email = '');

-- Log the update
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO updated_count 
  FROM chawp_user_profiles 
  WHERE email IS NOT NULL;
  
  RAISE NOTICE 'Updated % user profiles with email addresses', updated_count;
END $$;
