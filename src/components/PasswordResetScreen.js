import React, { useMemo, useState } from "react";
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

import { spacing, radii, typography } from "../theme";
import { supabase } from "../config/supabase";
import { useNotification } from "../contexts/NotificationContext";
import { useTheme } from "../contexts/ThemeContext";

export default function PasswordResetScreen({ onComplete }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const notification = useNotification();

  const handleResetPassword = async () => {
    if (!newPassword || !confirmPassword) {
      notification.error("Error", "Please fill in both password fields");
      return;
    }

    if (newPassword.length < 6) {
      notification.error("Error", "Password must be at least 6 characters");
      return;
    }

    if (newPassword !== confirmPassword) {
      notification.error("Error", "Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      // DIAGNOSTIC: Check current session with retry logic
      setStatusMessage("Step 1/3: Validating session...");
      console.log("=== PASSWORD RESET DIAGNOSTICS ===");

      let sessionData = null;
      let sessionError = null;
      let attempts = 0;
      const maxAttempts = 5;

      // Retry logic with delays to give session time to establish
      while (attempts < maxAttempts && !sessionData?.session) {
        attempts++;
        console.log(`Session validation attempt ${attempts}/${maxAttempts}`);

        const result = await supabase.auth.getSession();
        sessionData = result.data;
        sessionError = result.error;

        console.log(
          `Attempt ${attempts} - Session exists:`,
          !!sessionData?.session,
        );
        console.log(
          `Attempt ${attempts} - User:`,
          sessionData?.session?.user?.email,
        );

        if (sessionData?.session) {
          break;
        }

        // Wait before retrying (800ms, 1.6s, 2.4s, 3.2s)
        if (attempts < maxAttempts) {
          const delay = 800 * attempts;
          console.log(`Waiting ${delay}ms before retry...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }

      console.log("Current session exists:", !!sessionData?.session);
      console.log("User ID:", sessionData?.session?.user?.id);
      console.log("Session error:", sessionError?.message);
      console.log("Attempts needed:", attempts);

      if (sessionError) {
        throw new Error(`Session error: ${sessionError.message}`);
      }

      if (!sessionData?.session) {
        throw new Error(
          "No active session found. Please request a new password reset link.",
        );
      }

      // DIAGNOSTIC: Attempt password update
      setStatusMessage("Step 2/3: Updating password...");
      console.log("Attempting password update...");

      const { data: updateData, error: updateError } =
        await supabase.auth.updateUser({
          password: newPassword,
        });

      console.log(
        "Update result:",
        JSON.stringify({
          hasData: !!updateData,
          hasError: !!updateError,
          errorMessage: updateError?.message,
          userId: updateData?.user?.id,
        }),
      );

      if (updateError) {
        console.error("Password update error:", updateError);
        throw new Error(updateError.message || "Failed to update password");
      }

      if (!updateData?.user) {
        throw new Error(
          "Password update returned no user data. Update may have failed.",
        );
      }

      setStatusMessage("Step 3/3: Finalizing...");
      console.log(
        "Password updated successfully for user:",
        updateData.user.id,
      );

      notification.success(
        "Success",
        "Your password has been reset successfully!",
      );
      console.log("=== PASSWORD RESET COMPLETE ===");

      // Clear fields
      setNewPassword("");
      setConfirmPassword("");

      setStatusMessage("Redirecting to app...");
      setTimeout(() => {
        setLoading(false);
        setStatusMessage("");
        if (onComplete) {
          onComplete();
        }
      }, 800);
    } catch (error) {
      console.error("=== PASSWORD RESET ERROR ===");
      console.error("Error type:", error.constructor.name);
      console.error("Error message:", error.message);
      console.error("Full error:", error);

      // Show detailed error to user
      const errorMessage = error.message || "Failed to update password";
      notification.error("Password Reset Failed", errorMessage);

      // Set user-friendly status message based on error
      if (errorMessage.includes("session")) {
        setStatusMessage(
          "❌ Session expired. Please request a new reset link.",
        );
      } else if (errorMessage.includes("timeout")) {
        setStatusMessage(
          "❌ Request timed out. Check your connection and try again.",
        );
      } else {
        setStatusMessage(`❌ Error: ${errorMessage}`);
      }

      setLoading(false);

      // Keep error message visible for 5 seconds
      setTimeout(() => {
        setStatusMessage("");
      }, 5000);
    }
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
              <Ionicons name="lock-closed" size={64} color={colors.primary} />
              <Text style={styles.title}>Reset Password</Text>
              <Text style={styles.subtitle}>Enter your new password below</Text>
            </View>

            {/* Form */}
            <View style={styles.form}>
              {/* New Password Input */}
              <View style={styles.inputContainer}>
                <Ionicons
                  name="lock-closed-outline"
                  size={20}
                  color={colors.textSecondary}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder="New Password"
                  placeholderTextColor={colors.textSecondary}
                  secureTextEntry={!showPassword}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.eyeIcon}
                >
                  <Ionicons
                    name={showPassword ? "eye-outline" : "eye-off-outline"}
                    size={20}
                    color={colors.textSecondary}
                  />
                </TouchableOpacity>
              </View>

              {/* Confirm Password Input */}
              <View style={styles.inputContainer}>
                <Ionicons
                  name="lock-closed"
                  size={20}
                  color={colors.textSecondary}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Confirm Password"
                  placeholderTextColor={colors.textSecondary}
                  secureTextEntry={!showConfirmPassword}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                  style={styles.eyeIcon}
                >
                  <Ionicons
                    name={
                      showConfirmPassword ? "eye-outline" : "eye-off-outline"
                    }
                    size={20}
                    color={colors.textSecondary}
                  />
                </TouchableOpacity>
              </View>

              {/* Submit Button */}
              <TouchableOpacity
                style={[
                  styles.submitButton,
                  loading && styles.submitButtonDisabled,
                ]}
                onPress={handleResetPassword}
                disabled={loading}
              >
                <Text style={styles.submitButtonText}>
                  {loading ? "Updating..." : "Update Password"}
                </Text>
              </TouchableOpacity>

              {/* Status Message */}
              {statusMessage && (
                <View style={styles.statusContainer}>
                  <Ionicons
                    name="sync"
                    size={16}
                    color={colors.primary}
                    style={styles.statusIcon}
                  />
                  <Text style={styles.statusText}>{statusMessage}</Text>
                </View>
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
      fontSize: 32,
      marginTop: spacing.md,
      marginBottom: spacing.sm,
    },
    subtitle: {
      ...typography.body,
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
    statusContainer: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      marginTop: spacing.md,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      backgroundColor: colors.surface,
      borderRadius: radii.md,
    },
    statusIcon: {
      marginRight: spacing.sm,
    },
    statusText: {
      color: colors.primary,
      fontSize: 14,
      fontWeight: "500",
    },
  });
