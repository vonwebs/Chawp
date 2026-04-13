import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";

// TODO: Replace these with your actual Supabase project credentials
// You can find these in your Supabase project settings under API
const SUPABASE_URL = "https://qxxflbymaoledpluzqtb.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4eGZsYnltYW9sZWRwbHV6cXRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIwMDk3MzIsImV4cCI6MjA3NzU4NTczMn0.t4hkTwSX7SLxHXdjs00pYaWF7FJj_AjZCyqO5ifpM5k";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true, // Enable for password reset deep links
  },
});
