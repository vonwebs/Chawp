-- Create a separate table for device-specific push tokens
-- This allows users to have multiple devices/apps with different tokens

CREATE TABLE IF NOT EXISTS chawp_device_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES chawp_user_profiles(id) ON DELETE CASCADE NOT NULL,
  push_token TEXT NOT NULL,
  device_type TEXT, -- 'customer', 'admin', 'vendor', 'delivery'
  device_info TEXT, -- Optional device information
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, device_type, push_token)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_device_tokens_user_id ON chawp_device_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_device_tokens_device_type ON chawp_device_tokens(device_type);
CREATE INDEX IF NOT EXISTS idx_device_tokens_push_token ON chawp_device_tokens(push_token);

-- Enable RLS
ALTER TABLE chawp_device_tokens ENABLE ROW LEVEL SECURITY;

-- Policy: Users can manage their own device tokens
CREATE POLICY "Users can manage own device tokens"
  ON chawp_device_tokens
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Allow service role to read all tokens (for sending notifications)
CREATE POLICY "Service role can read all tokens"
  ON chawp_device_tokens
  FOR SELECT
  USING (true);

COMMENT ON TABLE chawp_device_tokens IS 'Stores push notification tokens for different devices/apps per user';
