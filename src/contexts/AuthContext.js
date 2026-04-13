import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
} from "react";
import { supabase } from "../config/supabase";
import { getUserProfile } from "../services/api";

const AuthContext = createContext({});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [initializing, setInitializing] = useState(true);
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);

  // Use ref to track recovery mode in auth listener (avoids stale closure)
  const isRecoveryModeRef = useRef(false);
  const profileLoadPromiseRef = useRef(null);
  const profileLoadUserIdRef = useRef(null);

  // Keep ref in sync with state
  useEffect(() => {
    isRecoveryModeRef.current = isRecoveryMode;
  }, [isRecoveryMode]);

  useEffect(() => {
    let mounted = true;
    let subscription;

    // Initialize auth session
    const initializeAuth = async () => {
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (!mounted) return;

        if (error) {
          console.error("Session error:", error);
          setUser(null);
          setProfile(null);
          setLoading(false);
          setInitializing(false);
          return;
        }

        console.log("Initial session:", session ? "Found" : "None");

        if (session?.user) {
          setUser(session.user);
          await loadUserProfile(session.user.id);
        } else {
          setUser(null);
          setProfile(null);
          setLoading(false);
        }

        setInitializing(false);
      } catch (err) {
        if (!mounted) return;
        console.error("Session retrieval failed:", err);
        setUser(null);
        setProfile(null);
        setLoading(false);
        setInitializing(false);
      }
    };

    // Set up auth state listener
    const setupAuthListener = () => {
      const {
        data: { subscription: authSubscription },
      } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (!mounted) return;

        console.log("=== AUTH STATE CHANGE ===");
        console.log("Event:", event);
        console.log("Has session:", !!session);
        console.log("Has user:", !!session?.user);
        console.log("User email:", session?.user?.email);

        // Skip INITIAL_SESSION event as we handle it separately
        if (event === "INITIAL_SESSION") {
          console.log("Skipping INITIAL_SESSION (handled by initializeAuth)");
          return;
        }

        // Handle sign in
        if (event === "SIGNED_IN" && session?.user) {
          console.log("✅ Processing SIGNED_IN event");
          console.log("Setting user:", session.user.email);
          setUser(session.user);

          // Skip profile loading during password recovery to prevent session invalidation
          if (isRecoveryModeRef.current) {
            console.log("⚠️ Skipping profile load - recovery mode active");
            setLoading(false);
          } else {
            console.log("Loading user profile...");
            const loadedProfile = await loadUserProfile(session.user.id);
            console.log(
              loadedProfile
                ? "✅ Profile loaded, auth complete"
                : "⚠️ Continuing without profile, auth complete",
            );
          }
        }
        // Handle sign out
        else if (event === "SIGNED_OUT") {
          console.log("Processing SIGNED_OUT event");
          setUser(null);
          setProfile(null);
          setLoading(false);
        }
        // Handle token refresh
        else if (event === "TOKEN_REFRESHED" && session?.user) {
          console.log("Processing TOKEN_REFRESHED event");
          setUser(session.user);
          // Optionally refresh profile on token refresh
        }
        // Handle user update
        else if (event === "USER_UPDATED" && session?.user) {
          console.log("Processing USER_UPDATED event");
          setUser(session.user);
          // If we were in recovery mode and user was updated, exit recovery mode
          if (isRecoveryModeRef.current) {
            console.log("✅ Password updated - exiting recovery mode");
            setIsRecoveryMode(false);
          }
        }
        // Handle password recovery event
        else if (event === "PASSWORD_RECOVERY") {
          console.log("🔐 PASSWORD_RECOVERY event - enabling recovery mode");
          setIsRecoveryMode(true);
        }
      });

      subscription = authSubscription;
    };

    // Initialize and set up listener
    initializeAuth();
    setupAuthListener();

    return () => {
      mounted = false;
      if (subscription) {
        subscription.unsubscribe();
      }
    };
  }, []);

  const loadUserProfile = async (userId) => {
    if (
      profileLoadPromiseRef.current &&
      profileLoadUserIdRef.current === userId
    ) {
      return profileLoadPromiseRef.current;
    }

    const loadPromise = (async () => {
    try {
      console.log("Loading user profile for user ID:", userId);
      setLoading(true);

      const loadWithTimeout = async (attempt = 1) => {
        const timeoutMs = 25000;
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error("Profile loading timeout")), timeoutMs);
        });

        try {
          return await Promise.race([getUserProfile(), timeoutPromise]);
        } catch (err) {
          if (err.message === "Profile loading timeout" && attempt < 2) {
            console.log("Profile load timed out, retrying once...");
            return loadWithTimeout(attempt + 1);
          }
          throw err;
        }
      };

      const userProfile = await loadWithTimeout();

      console.log("✅ User profile loaded:", userProfile?.id);
      setProfile(userProfile);
      return userProfile;
    } catch (error) {
      console.error("❌ Error loading user profile:", error);

      // If it's an auth error (401/403), sign out the user
      // But NOT for timeout errors - just continue without profile
      if (
        error.message?.includes("401") ||
        error.message?.includes("403") ||
        error.message?.includes("JWT") ||
        error.message?.includes("expired")
      ) {
        console.log("Auth error detected - signing out");
        await supabase.auth.signOut();
        setUser(null);
        setProfile(null);
        return null;
      } else {
        // For other errors (including timeout), still set profile to null but keep user
        console.log("Non-auth error - keeping user, clearing profile");
        setProfile(null);
        return null;
      }
    } finally {
      profileLoadPromiseRef.current = null;
      profileLoadUserIdRef.current = null;
      console.log("Setting loading to false");
      setLoading(false);
    }
    })();

    profileLoadPromiseRef.current = loadPromise;
    profileLoadUserIdRef.current = userId;

    return loadPromise;
  };

  const signUp = async (email, password, metadata = {}) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: metadata,
      },
    });
    return { data, error };
  };

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { data, error };
  };

  const signInWithGoogle = async () => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: "chawp://",
        skipBrowserRedirect: true,
      },
    });
    return { data, error };
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    return { error };
  };

  const updateProfile = async (updates) => {
    // This will be handled by the API function
    const updatedProfile = await getUserProfile();
    setProfile(updatedProfile);
    return updatedProfile;
  };

  const value = {
    user,
    profile,
    loading,
    signUp,
    signIn,
    signInWithGoogle,
    signOut,
    updateProfile,
    isAuthenticated: !!user,
    isRecoveryMode,
    setIsRecoveryMode,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
