import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import LoadingPlaceholder from "./LoadingPlaceholder";
import * as WebBrowser from "expo-web-browser";

import { spacing, radii, typography } from "../theme";
import { useAuth } from "../contexts/AuthContext";
import { useNotification } from "../contexts/NotificationContext";
import { useTheme } from "../contexts/ThemeContext";

WebBrowser.maybeCompleteAuthSession();

export default function AuthScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [isLogin, setIsLogin] = useState(true);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const {
    signIn,
    signUp,
    signInWithGoogle,
    user,
    loading: authLoading,
  } = useAuth();
  const notification = useNotification();

  // Clear Google loading state when user is authenticated or auth loading completes
  useEffect(() => {
    if (googleLoading) {
      if (user) {
        console.log("User authenticated - clearing Google loading state");
        setGoogleLoading(false);
      } else if (!authLoading) {
        // Auth finished loading but no user - something went wrong, clear loading
        console.log(
          "Auth loading complete but no user - clearing Google loading state",
        );
        setGoogleLoading(false);
      }
    }
  }, [user, googleLoading, authLoading]);

  // Timeout for Google loading state to prevent infinite loading
  useEffect(() => {
    if (googleLoading) {
      const timeout = setTimeout(() => {
        console.log("Google loading timeout - clearing loading state");
        setGoogleLoading(false);
        notification.error(
          "Timeout",
          "Google sign-in took too long. Please try again.",
        );
      }, 30000); // 30 second timeout

      return () => clearTimeout(timeout);
    }
  }, [googleLoading]);

  const handleSubmit = async () => {
    if (!email || !password) {
      notification.error("Error", "Please fill in all fields");
      return;
    }

    if (!isLogin && !fullName) {
      notification.error("Error", "Please enter your full name");
      return;
    }

    setLoading(true);
    try {
      if (isLogin) {
        const { error } = await signIn(email, password);
        if (error) throw error;
        // Navigation will be handled by auth state change
      } else {
        const { error } = await signUp(email, password, {
          full_name: fullName,
        });
        if (error) throw error;
        notification.success(
          "Success",
          "Account created! Please check your email to verify your account.",
        );
      }
    } catch (error) {
      notification.error("Error", error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      notification.error("Error", "Please enter your email address");
      return;
    }

    setLoading(true);
    try {
      const { supabase } = await import("../config/supabase");
      // Using Supabase's verification endpoint with redirect to app
      // The email will contain a clickable HTTPS link that redirects to the app
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: "chawp://reset-password",
      });

      if (error) throw error;

      notification.success(
        "Password Reset",
        "Check your email for the password reset link!",
      );
      setIsForgotPassword(false);
      setEmail("");
    } catch (error) {
      notification.error("Error", error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      const { data, error } = await signInWithGoogle();

      if (error) throw error;

      if (data?.url) {
        console.log("Opening Google OAuth URL...");
        // Open the OAuth URL in a browser
        const result = await WebBrowser.openAuthSessionAsync(
          data.url,
          "chawp://",
        );

        console.log("WebBrowser result:", result.type);
        console.log("WebBrowser result URL:", result.url);

        if (result.type === "success" && result.url) {
          // Process the OAuth redirect URL directly instead of waiting for deep link
          console.log(
            "Google OAuth redirect successful - processing URL directly",
          );

          try {
            // Extract tokens from the URL
            let params = null;
            if (result.url.includes("#")) {
              const hash = result.url.split("#")[1];
              params = new URLSearchParams(hash);
            } else if (result.url.includes("?")) {
              const query = result.url.split("?")[1];
              params = new URLSearchParams(query);
            }

            if (params) {
              const accessToken = params.get("access_token");
              const refreshToken = params.get("refresh_token");

              if (accessToken && refreshToken) {
                console.log("Setting OAuth session from WebBrowser result...");
                const { supabase } = await import("../config/supabase");
                const { data: sessionData, error: sessionError } =
                  await supabase.auth.setSession({
                    access_token: accessToken,
                    refresh_token: refreshToken,
                  });

                if (sessionError) {
                  console.error("Error setting OAuth session:", sessionError);
                  throw sessionError;
                }

                console.log("✅ OAuth session set successfully");
                console.log("User:", sessionData?.user?.email);
                // Auth state listener will handle the rest
                // googleLoading will be cleared by useEffect when user is set
                return;
              }
            }

            // If we couldn't extract tokens, fall back to waiting for deep link
            console.log(
              "Could not extract tokens from URL - waiting for deep link handler",
            );
          } catch (urlError) {
            console.error("Error processing OAuth URL:", urlError);
            // Don't throw - let the deep link handler try
          }
        } else if (result.type === "cancel") {
          notification.error("Cancelled", "Google sign-in was cancelled");
          setGoogleLoading(false);
        } else {
          // Dismiss or other - clear loading state
          console.log("WebBrowser dismissed - clearing loading state");
          setGoogleLoading(false);
        }
      } else {
        throw new Error("No OAuth URL returned from Supabase");
      }
    } catch (error) {
      console.error("Google sign-in error:", error);
      notification.error(
        "Error",
        error.message || "Failed to sign in with Google",
      );
      setGoogleLoading(false);
    }
    // Don't set googleLoading to false here if successful -
    // let the auth state change do it
  };

  return (
    <LinearGradient
      colors={[colors.background, colors.surface]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.keyboardView}
        >
          <View style={styles.content}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>Chawp</Text>
              <Text style={styles.subtitle}>
                {isForgotPassword
                  ? "Reset your password"
                  : isLogin
                    ? "Welcome back!"
                    : "Join the food revolution"}
              </Text>
            </View>

            {/* Form */}
            <View style={styles.form}>
              {!isLogin && !isForgotPassword && (
                <View style={styles.inputContainer}>
                  <Ionicons
                    name="person-outline"
                    size={20}
                    color={colors.textSecondary}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Full Name"
                    placeholderTextColor={colors.textSecondary}
                    value={fullName}
                    onChangeText={setFullName}
                    autoCapitalize="words"
                  />
                </View>
              )}

              <View style={styles.inputContainer}>
                <Ionicons
                  name="mail-outline"
                  size={20}
                  color={colors.textSecondary}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Email"
                  placeholderTextColor={colors.textSecondary}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              {!isForgotPassword && (
                <View style={styles.inputContainer}>
                  <Ionicons
                    name="lock-closed-outline"
                    size={20}
                    color={colors.textSecondary}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Password"
                    placeholderTextColor={colors.textSecondary}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TouchableOpacity
                    style={styles.eyeIcon}
                    onPress={() => setShowPassword(!showPassword)}
                  >
                    <Ionicons
                      name={showPassword ? "eye-off-outline" : "eye-outline"}
                      size={20}
                      color={colors.textSecondary}
                    />
                  </TouchableOpacity>
                </View>
              )}

              {isLogin && !isForgotPassword && (
                <TouchableOpacity
                  style={styles.forgotPasswordButton}
                  onPress={() => setIsForgotPassword(true)}
                >
                  <Text style={styles.forgotPasswordText}>
                    Forgot Password?
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[
                  styles.submitButton,
                  loading && styles.submitButtonDisabled,
                ]}
                onPress={isForgotPassword ? handleForgotPassword : handleSubmit}
                disabled={loading}
              >
                <Text style={styles.submitButtonText}>
                  {loading
                    ? "Please wait..."
                    : isForgotPassword
                      ? "Send Reset Link"
                      : isLogin
                        ? "Sign In"
                        : "Sign Up"}
                </Text>
              </TouchableOpacity>

              {/* Google Sign In - Only show on login screen */}
              {!isForgotPassword && isLogin && (
                <>
                  <View style={styles.dividerContainer}>
                    <View style={styles.divider} />
                    <Text style={styles.dividerText}>OR</Text>
                    <View style={styles.divider} />
                  </View>

                  <TouchableOpacity
                    style={[
                      styles.googleButton,
                      googleLoading && styles.submitButtonDisabled,
                    ]}
                    onPress={handleGoogleSignIn}
                    disabled={googleLoading || loading}
                  >
                    {googleLoading ? (
                      <LoadingPlaceholder
                        width={20}
                        height={20}
                        borderRadius={10}
                      />
                    ) : (
                      <>
                        <Ionicons
                          name="logo-google"
                          size={20}
                          color={colors.textPrimary}
                          style={styles.googleIcon}
                        />
                        <Text style={styles.googleButtonText}>
                          Continue with Google
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </>
              )}
            </View>

            {/* Toggle */}
            <View style={styles.toggleContainer}>
              {isForgotPassword ? (
                <TouchableOpacity
                  onPress={() => {
                    setIsForgotPassword(false);
                    setEmail("");
                  }}
                >
                  <Text style={styles.toggleLink}>← Back to Sign In</Text>
                </TouchableOpacity>
              ) : (
                <>
                  <Text style={styles.toggleText}>
                    {isLogin
                      ? "Don't have an account? "
                      : "Already have an account? "}
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      setIsLogin(!isLogin);
                      setIsForgotPassword(false);
                    }}
                  >
                    <Text style={styles.toggleLink}>
                      {isLogin ? "Sign Up" : "Sign In"}
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    safeArea: {
      flex: 1,
    },
    keyboardView: {
      flex: 1,
    },
    content: {
      flex: 1,
      justifyContent: "center",
      paddingHorizontal: spacing.lg,
    },
    header: {
      alignItems: "center",
      marginBottom: spacing.xl,
    },
    title: {
      ...typography.display,
      color: colors.textPrimary,
      fontSize: 48,
      marginBottom: spacing.sm,
    },
    subtitle: {
      ...typography.title,
      color: colors.textSecondary,
      textAlign: "center",
    },
    form: {
      marginBottom: spacing.xl,
    },
    inputContainer: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      marginBottom: spacing.md,
      paddingHorizontal: spacing.md,
      height: 50,
    },
    inputIcon: {
      marginRight: spacing.sm,
    },
    input: {
      flex: 1,
      color: colors.textPrimary,
      fontSize: 16,
    },
    eyeIcon: {
      padding: spacing.xs,
      marginLeft: spacing.xs,
    },
    forgotPasswordButton: {
      alignSelf: "flex-end",
      marginTop: -spacing.xs,
      marginBottom: spacing.xs,
    },
    forgotPasswordText: {
      color: colors.primary,
      fontSize: 14,
      fontWeight: "500",
    },
    submitButton: {
      backgroundColor: colors.primary,
      borderRadius: radii.pill,
      height: 50,
      alignItems: "center",
      justifyContent: "center",
      marginTop: spacing.md,
    },
    submitButtonDisabled: {
      opacity: 0.6,
    },
    submitButtonText: {
      color: colors.card,
      fontSize: 16,
      fontWeight: "600",
    },
    dividerContainer: {
      flexDirection: "row",
      alignItems: "center",
      marginVertical: spacing.lg,
    },
    divider: {
      flex: 1,
      height: 1,
      backgroundColor: colors.border || colors.surface,
    },
    dividerText: {
      color: colors.textSecondary,
      marginHorizontal: spacing.md,
      fontSize: 14,
    },
    googleButton: {
      backgroundColor: colors.surface,
      borderRadius: radii.pill,
      height: 50,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.border || colors.textMuted,
    },
    googleIcon: {
      marginRight: spacing.sm,
    },
    googleButtonText: {
      color: colors.textPrimary,
      fontSize: 16,
      fontWeight: "600",
    },
    toggleContainer: {
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
    },
    toggleText: {
      color: colors.textSecondary,
    },
    toggleLink: {
      color: colors.primary,
      fontWeight: "600",
    },
  });
