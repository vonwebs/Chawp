import React, { useMemo } from "react";
import {
  Image,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Updates from "expo-updates";

import {
  getThemeModeLabel,
  spacing,
  radii,
  typography,
  responsive,
  THEME_MODES,
} from "../theme";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import { useNotification } from "../contexts/NotificationContext";
import { updateUserProfile, fetchUserStats } from "../services/api";
import { supabase } from "../config/supabase";
import { useDataFetching } from "../hooks/useDataFetching";
import LoadingPlaceholder from "../components/LoadingPlaceholder";

export default function ProfilePage({
  onNavigateToOrderHistory,
  onOpenPrivacy,
}) {
  const { user, profile, signOut, updateProfile } = useAuth();
  const { themeMode, resolvedColorScheme, updateThemeMode, colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const notification = useNotification();
  const [themeModalVisible, setThemeModalVisible] = React.useState(false);
  const [isEditing, setIsEditing] = React.useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = React.useState(false);
  const [deletePassword, setDeletePassword] = React.useState("");
  const [deleteReason, setDeleteReason] = React.useState("");
  const [deletingAccount, setDeletingAccount] = React.useState(false);
  const [passwordModalVisible, setPasswordModalVisible] = React.useState(false);
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [updatingPassword, setUpdatingPassword] = React.useState(false);
  const [showNewPassword, setShowNewPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);
  const [editedProfile, setEditedProfile] = React.useState({
    username: profile?.username || "",
    full_name: profile?.full_name || "",
    phone: profile?.phone || "",
    address: profile?.address || "",
  });

  const effectiveTheme =
    themeMode === "system" ? resolvedColorScheme || "dark" : themeMode;

  // Fetch dynamic data with cache keys and user dependency
  const {
    data: userStats,
    loading: statsLoading,
    refresh: refreshStats,
  } = useDataFetching(fetchUserStats, [user?.id], `user-stats-${user?.id}`);
  React.useEffect(() => {
    if (profile) {
      console.log("Profile loaded:", profile);
      setEditedProfile({
        username: profile.username || "",
        full_name: profile.full_name || "",
        phone: profile.phone || "",
        address: profile.address || "",
      });
    }
  }, [profile]);

  React.useEffect(() => {
    console.log("User data:", user);
    console.log("Profile data:", profile);
  }, [user, profile]);

  const handleSaveProfile = async () => {
    try {
      const result = await updateUserProfile(editedProfile);
      console.log("Profile update result:", result);

      // Reload the profile from context
      await updateProfile();

      setIsEditing(false);
      notification.success("Success", "Profile updated successfully!");
    } catch (error) {
      console.error("Profile update error:", error);
      notification.error(
        "Error",
        error.message || "Failed to update profile. Please try again.",
      );
    }
  };

  const handleSignOut = async () => {
    notification.alert(
      "Sign Out",
      "Are you sure you want to sign out?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign Out",
          style: "destructive",
          onPress: async () => {
            try {
              await signOut();
            } catch (error) {
              notification.error(
                "Error",
                "Failed to sign out. Please try again.",
              );
            }
          },
        },
      ],
      { type: "warning" },
    );
  };

  const closeDeleteModal = () => {
    setDeleteModalVisible(false);
    setDeletePassword("");
    setDeleteReason("");
  };

  const promptDeleteAccount = () => {
    notification.alert(
      "Delete Account",
      "This will permanently delete your customer account. This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          style: "destructive",
          onPress: () => setDeleteModalVisible(true),
        },
      ],
      { type: "warning" },
    );
  };

  const handleDeleteAccount = async () => {
    if (!deletePassword.trim()) {
      notification.warning(
        "Password Required",
        "Enter your password to confirm account deletion.",
      );
      return;
    }

    setDeletingAccount(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "account-lifecycle",
        {
          body: {
            action: "delete_customer",
            password: deletePassword,
            reason: deleteReason,
          },
        },
      );

      if (error) {
        throw new Error(error.message || "Failed to delete account");
      }

      if (!data?.success) {
        throw new Error(data?.error || "Failed to delete account");
      }

      closeDeleteModal();
      await signOut();

      notification.success(
        "Account Deleted",
        "Your account has been deleted successfully.",
      );
    } catch (error) {
      notification.error(
        "Deletion Failed",
        error.message || "Could not delete your account. Please try again.",
      );
    } finally {
      setDeletingAccount(false);
    }
  };

  const handleContactSupport = () => {
    // Open WhatsApp for support
    const phoneNumber = "233509330098"; // Ghana number format
    const message = encodeURIComponent("Hi Chawp Support, I need help with...");

    // Try both WhatsApp URL schemes
    const whatsappUrl = `https://wa.me/${phoneNumber}?text=${message}`;
    const whatsappAppUrl = `whatsapp://send?phone=${phoneNumber}&text=${message}`;

    // Try opening WhatsApp app first, then web fallback
    Linking.openURL(whatsappAppUrl)
      .catch(() => {
        Linking.openURL(whatsappUrl).catch(() => {
          // Final fallback to email
          const emailUrl = `mailto:support@chawp.com?subject=Support Request&body=${message}`;
          Linking.openURL(emailUrl);
        });
      })
      .catch((err) => {
        notification.error("Error", "Unable to open support contact");
      });
  };

  const handleOrderHistory = () => {
    if (onNavigateToOrderHistory) {
      onNavigateToOrderHistory();
    } else {
      notification.info(
        "Order History",
        "Opening your order history and statements...",
      );
    }
  };

  const handlePrivacyCenter = () => {
    console.log("handlePrivacyCenter called, onOpenPrivacy:", onOpenPrivacy);
    if (onOpenPrivacy) {
      console.log("Calling onOpenPrivacy");
      onOpenPrivacy();
    } else {
      console.log("onOpenPrivacy not available");
      notification.info(
        "Privacy Center",
        "Privacy settings will be available soon.",
      );
    }
  };

  const handleOpenNotificationSettings = async () => {
    try {
      await Linking.openSettings();
    } catch (error) {
      notification.error(
        "Settings Unavailable",
        "Unable to open notification settings on this device.",
      );
    }
  };

  const themeLabelMap = {
    system: getThemeModeLabel(THEME_MODES.SYSTEM, effectiveTheme),
    dark: getThemeModeLabel(THEME_MODES.DARK, effectiveTheme),
    light: getThemeModeLabel(THEME_MODES.LIGHT, effectiveTheme),
  };

  const handleSelectThemeMode = async (mode) => {
    await updateThemeMode(mode);
    setThemeModalVisible(false);
  };

  const openPasswordModal = () => {
    setPasswordModalVisible(true);
  };

  const closePasswordModal = () => {
    setPasswordModalVisible(false);
    setNewPassword("");
    setConfirmPassword("");
    setShowNewPassword(false);
    setShowConfirmPassword(false);
  };

  const handleChangePassword = async () => {
    if (!newPassword || !confirmPassword) {
      notification.warning("Missing Fields", "Please fill in both fields.");
      return;
    }

    if (newPassword.length < 6) {
      notification.warning(
        "Weak Password",
        "Password must be at least 6 characters.",
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      notification.warning("Mismatch", "Passwords do not match.");
      return;
    }

    setUpdatingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        throw new Error(error.message || "Failed to update password.");
      }

      closePasswordModal();
      notification.success("Password Updated", "Your password was changed.");
    } catch (error) {
      notification.error(
        "Update Failed",
        error.message || "Could not update password. Please try again.",
      );
    } finally {
      setUpdatingPassword(false);
    }
  };

  const pickImage = async () => {
    try {
      // Request permissions
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        notification.warning(
          "Permission needed",
          "Please grant permission to access your photos",
        );
        return;
      }

      // Pick image
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled) {
        await uploadImage(result.assets[0].uri);
      }
    } catch (error) {
      notification.error("Error", "Failed to pick image");
    }
  };

  const uploadImage = async (uri) => {
    try {
      const fileName = `${user.id}_${Date.now()}.jpg`;
      const filePath = `avatars/users/${user.id}/${fileName}`;

      // For React Native Expo, we need to create a FormData object
      const formData = new FormData();

      // Extract file info from URI
      const fileInfo = {
        uri: uri,
        type: "image/jpeg",
        name: fileName,
      };

      // Append to FormData (React Native compatible)
      formData.append("file", fileInfo);

      // Get the session for authorization
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        throw new Error("Not authenticated");
      }

      // Upload using fetch with FormData (React Native compatible)
      const uploadResponse = await fetch(
        `${supabase.supabaseUrl}/storage/v1/object/chawp/${filePath}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          body: formData,
        },
      );

      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json();
        throw new Error(errorData.message || "Upload failed");
      }

      // Get public URL
      const {
        data: { publicUrl },
      } = supabase.storage.from("chawp").getPublicUrl(filePath);

      // Update profile
      await updateUserProfile({ avatar_url: publicUrl });
      await updateProfile(); // Refresh profile
      notification.success("Success", "Profile picture updated!");
    } catch (error) {
      console.error("Upload error:", error);
      notification.error("Error", error.message || "Failed to upload image");
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View style={styles.headerInfo}>
          <TouchableOpacity style={styles.avatarContainer} onPress={pickImage}>
            <Image
              source={{
                uri:
                  profile?.avatar_url ||
                  "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=400&q=80",
              }}
              style={styles.avatar}
            />
            <View style={styles.avatarOverlay}>
              <Ionicons name="camera" size={16} color={colors.card} />
            </View>
          </TouchableOpacity>
          <View>
            <Text style={styles.name} numberOfLines={1} ellipsizeMode="tail">
              {profile?.username || profile?.full_name || "User"}
            </Text>
            <Text style={styles.email}>{user?.email || "No email"}</Text>
            <Text style={styles.location}>
              {profile?.address || "No address set"}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.editButton}
          onPress={() => setIsEditing(!isEditing)}
        >
          <Ionicons
            name={isEditing ? "checkmark" : "create"}
            size={18}
            color={colors.card}
          />
          <Text style={styles.editButtonText}>
            {isEditing ? "Save" : "Edit profile"}
          </Text>
        </TouchableOpacity>
      </View>

      {isEditing && (
        <View style={styles.editSection}>
          <Text style={styles.editSectionTitle}>Edit Profile</Text>

          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Email</Text>
            <TextInput
              style={[styles.input, styles.inputDisabled]}
              value={user?.email || ""}
              editable={false}
              placeholder="Email address"
              placeholderTextColor={colors.textSecondary}
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Username</Text>
            <TextInput
              style={styles.input}
              value={editedProfile.username}
              onChangeText={(text) =>
                setEditedProfile({ ...editedProfile, username: text })
              }
              placeholder="Enter your username"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Full Name</Text>
            <TextInput
              style={styles.input}
              value={editedProfile.full_name}
              onChangeText={(text) =>
                setEditedProfile({ ...editedProfile, full_name: text })
              }
              placeholder="Enter your full name"
              placeholderTextColor={colors.textSecondary}
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Phone</Text>
            <TextInput
              style={styles.input}
              value={editedProfile.phone}
              onChangeText={(text) =>
                setEditedProfile({ ...editedProfile, phone: text })
              }
              placeholder="Enter your phone number"
              placeholderTextColor={colors.textSecondary}
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Address</Text>
            <TextInput
              style={styles.input}
              value={editedProfile.address}
              onChangeText={(text) =>
                setEditedProfile({ ...editedProfile, address: text })
              }
              placeholder="Enter your address"
              placeholderTextColor={colors.textSecondary}
              multiline
            />
          </View>

          <View style={styles.editActions}>
            <TouchableOpacity
              style={[styles.editActionButton, styles.cancelButton]}
              onPress={() => {
                setIsEditing(false);
                setEditedProfile({
                  username: profile?.username || "",
                  full_name: profile?.full_name || "",
                  phone: profile?.phone || "",
                  address: profile?.address || "",
                });
              }}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.editActionButton, styles.saveButton]}
              onPress={handleSaveProfile}
            >
              <Text style={styles.saveButtonText}>Save Changes</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={styles.statsRow}>
        <StatCard
          label="Total Orders"
          value={`${userStats?.orderCount || 0} orders`}
          icon="receipt"
          styles={styles}
          colors={colors}
        />
        <StatCard
          label="Reviews Made"
          value={`${userStats?.reviewCount || 0} reviews`}
          icon="star"
          styles={styles}
          colors={colors}
        />
        <StatCard
          label="Reward tier"
          value={userStats?.rewardTier || "Bronze"}
          icon="medal"
          styles={styles}
          colors={colors}
        />
      </View>

      <SectionHeader title="Settings" styles={styles} colors={colors} />
      <View style={styles.preferenceList}>
        <SupportRow
          icon="moon"
          label="Theme"
          description={themeLabelMap[themeMode]}
          onPress={() => setThemeModalVisible(true)}
          styles={styles}
          colors={colors}
        />
        <SupportRow
          icon="notifications"
          label="Enable Notifications"
          description="Open native settings to manage notifications"
          onPress={handleOpenNotificationSettings}
          styles={styles}
          colors={colors}
        />
        <SupportRow
          icon="create"
          label="Edit profile"
          description="Update your personal details"
          onPress={() => setIsEditing(true)}
          styles={styles}
          colors={colors}
        />
      </View>

      <SectionHeader title="Support" styles={styles} colors={colors} />
      <View style={[styles.supportList, styles.supportGroupSpacing]}>
        <SupportRow
          icon="chatbubble-ellipses"
          label="Contact concierge"
          description="Reach our 24/7 support team on chat"
          onPress={handleContactSupport}
          styles={styles}
          colors={colors}
        />
        <SupportRow
          icon="document-text"
          label="Order history"
          description="Download statements and invoices"
          onPress={handleOrderHistory}
          styles={styles}
          colors={colors}
        />
      </View>

      <SectionHeader
        title="Privacy & Security"
        styles={styles}
        colors={colors}
      />
      <View style={styles.supportList}>
        <SupportRow
          icon="shield-checkmark"
          label="Privacy and policy"
          description="Control data sharing and app policies"
          onPress={handlePrivacyCenter}
          styles={styles}
          colors={colors}
        />
        <SupportRow
          icon="lock-closed"
          label="Change password"
          description="Update your password in app"
          onPress={openPasswordModal}
          styles={styles}
          colors={colors}
        />
        <SupportRow
          icon="trash-outline"
          label="Delete account"
          description="Permanently remove your account"
          onPress={promptDeleteAccount}
          destructive
          styles={styles}
          colors={colors}
        />
      </View>

      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
        <Ionicons name="log-out-outline" size={20} color={colors.danger} />
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>

      <Modal
        visible={themeModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setThemeModalVisible(false)}
      >
        <View style={styles.deleteModalOverlay}>
          <View style={styles.deleteModalContent}>
            <Text style={styles.deleteModalTitle}>Theme</Text>
            <Text style={styles.deleteModalDescription}>
              Choose your preferred app appearance.
            </Text>

            <TouchableOpacity
              style={styles.themeOptionRow}
              onPress={() => handleSelectThemeMode("system")}
            >
              <Text style={styles.themeOptionLabel}>Follow system</Text>
              <Ionicons
                name={
                  themeMode === "system"
                    ? "radio-button-on"
                    : "radio-button-off"
                }
                size={20}
                color={
                  themeMode === "system" ? colors.primary : colors.textSecondary
                }
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.themeOptionRow}
              onPress={() => handleSelectThemeMode("dark")}
            >
              <Text style={styles.themeOptionLabel}>Default dark</Text>
              <Ionicons
                name={
                  themeMode === "dark" ? "radio-button-on" : "radio-button-off"
                }
                size={20}
                color={
                  themeMode === "dark" ? colors.primary : colors.textSecondary
                }
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.themeOptionRow}
              onPress={() => handleSelectThemeMode("light")}
            >
              <Text style={styles.themeOptionLabel}>Light</Text>
              <Ionicons
                name={
                  themeMode === "light" ? "radio-button-on" : "radio-button-off"
                }
                size={20}
                color={
                  themeMode === "light" ? colors.primary : colors.textSecondary
                }
              />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={passwordModalVisible}
        transparent
        animationType="slide"
        onRequestClose={closePasswordModal}
      >
        <View style={styles.deleteModalOverlay}>
          <View style={styles.deleteModalContent}>
            <Text style={styles.deleteModalTitle}>Change Password</Text>
            <Text style={styles.deleteModalDescription}>
              Enter a new password for your account.
            </Text>

            <View style={styles.passwordInputWrap}>
              <TextInput
                style={styles.deleteInput}
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="New password"
                placeholderTextColor={colors.textSecondary}
                secureTextEntry={!showNewPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity
                style={styles.passwordToggleButton}
                onPress={() => setShowNewPassword((prev) => !prev)}
              >
                <Ionicons
                  name={showNewPassword ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            </View>

            <View style={styles.passwordInputWrap}>
              <TextInput
                style={styles.deleteInput}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Confirm new password"
                placeholderTextColor={colors.textSecondary}
                secureTextEntry={!showConfirmPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity
                style={styles.passwordToggleButton}
                onPress={() => setShowConfirmPassword((prev) => !prev)}
              >
                <Ionicons
                  name={showConfirmPassword ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            </View>

            <View style={styles.deleteModalActions}>
              <TouchableOpacity
                style={styles.deleteCancelButton}
                onPress={closePasswordModal}
                disabled={updatingPassword}
              >
                <Text style={styles.deleteCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.deleteConfirmButton,
                  styles.passwordUpdateButton,
                ]}
                onPress={handleChangePassword}
                disabled={updatingPassword}
              >
                {updatingPassword ? (
                  <LoadingPlaceholder width={16} height={16} borderRadius={8} />
                ) : (
                  <Text style={styles.deleteConfirmText}>Update</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={deleteModalVisible}
        transparent
        animationType="slide"
        onRequestClose={closeDeleteModal}
      >
        <View style={styles.deleteModalOverlay}>
          <View style={styles.deleteModalContent}>
            <Text style={styles.deleteModalTitle}>
              Confirm Account Deletion
            </Text>
            <Text style={styles.deleteModalDescription}>
              Enter your password to permanently delete your customer account.
            </Text>

            <TextInput
              style={styles.deleteInput}
              value={deletePassword}
              onChangeText={setDeletePassword}
              placeholder="Password"
              placeholderTextColor={colors.textSecondary}
              secureTextEntry
              autoCapitalize="none"
            />

            <TextInput
              style={[styles.deleteInput, styles.deleteReasonInput]}
              value={deleteReason}
              onChangeText={setDeleteReason}
              placeholder="Reason (optional)"
              placeholderTextColor={colors.textSecondary}
              multiline
            />

            <View style={styles.deleteModalActions}>
              <TouchableOpacity
                style={styles.deleteCancelButton}
                onPress={closeDeleteModal}
                disabled={deletingAccount}
              >
                <Text style={styles.deleteCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.deleteConfirmButton}
                onPress={handleDeleteAccount}
                disabled={deletingAccount}
              >
                {deletingAccount ? (
                  <LoadingPlaceholder width={16} height={16} borderRadius={8} />
                ) : (
                  <Text style={styles.deleteConfirmText}>Delete</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function SectionHeader({ title, actionLabel, styles, colors }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {actionLabel ? (
        <TouchableOpacity style={styles.sectionAction}>
          <Text style={styles.sectionActionText}>{actionLabel}</Text>
          <Ionicons
            name="chevron-forward"
            size={16}
            color={colors.textSecondary}
          />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function StatCard({ label, value, icon, styles, colors }) {
  return (
    <View style={styles.statCard}>
      <Ionicons name={icon} size={20} color={colors.accent} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function PreferenceRow({
  icon,
  label,
  description,
  value,
  onToggle,
  disabled = false,
  type = "toggle",
}) {
  return (
    <View style={styles.preferenceRow}>
      <View style={styles.preferenceIcon}>
        <Ionicons name={icon} size={20} color={colors.textPrimary} />
      </View>
      <View style={styles.preferenceBody}>
        <Text style={styles.preferenceLabel}>{label}</Text>
        <Text style={styles.preferenceDescription}>{description}</Text>
      </View>
      {type === "toggle" ? (
        <Switch
          value={value}
          onValueChange={disabled ? undefined : onToggle}
          disabled={disabled}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor={colors.card}
        />
      ) : (
        <Ionicons
          name="chevron-forward"
          size={18}
          color={colors.textSecondary}
        />
      )}
    </View>
  );
}

function SupportRow({
  icon,
  label,
  description,
  onPress,
  destructive = false,
  styles,
  colors,
}) {
  return (
    <TouchableOpacity
      style={[styles.supportRow, destructive && styles.supportRowDestructive]}
      onPress={onPress || (() => console.log(`${label} pressed`))}
    >
      <View
        style={[
          styles.supportIcon,
          destructive && styles.supportIconDestructive,
        ]}
      >
        <Ionicons
          name={icon}
          size={20}
          color={destructive ? colors.danger : colors.textPrimary}
        />
      </View>
      <View style={styles.supportBody}>
        <Text
          style={[
            styles.supportLabel,
            destructive && styles.supportLabelDestructive,
          ]}
        >
          {label}
        </Text>
        <Text style={styles.supportDescription}>{description}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
    </TouchableOpacity>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      paddingVertical: spacing.xl,
      paddingHorizontal: spacing.lg,
      paddingBottom: 50,
      gap: spacing.xl,
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    headerInfo: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
    },
    avatar: {
      width: 72,
      height: 72,
      borderRadius: radii.lg,
      borderWidth: 2,
      borderColor: colors.highlight,
    },
    name: {
      ...typography.headline,
      color: colors.textPrimary,
      maxWidth: 120,
    },
    email: {
      color: colors.textSecondary,
      fontSize: responsive.scale(12),
      marginTop: spacing.xs / 2,
    },
    location: {
      color: colors.textSecondary,
    },
    editButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      backgroundColor: colors.accent,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radii.pill,
    },
    editButtonText: {
      color: colors.background,
      fontWeight: "700",
      fontSize: 14,
    },
    statsRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: spacing.md,
    },
    statCard: {
      flex: 1,
      backgroundColor: colors.card,
      paddingVertical: spacing.lg,
      borderRadius: radii.lg,
      alignItems: "center",
      gap: spacing.xs,
      borderWidth: 1,
      borderColor: colors.border,
    },
    statValue: {
      color: colors.textPrimary,
      fontWeight: "700",
      fontSize: 18,
    },
    statLabel: {
      color: colors.textSecondary,
      fontSize: 13,
    },
    sectionHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    sectionTitle: {
      ...typography.title,
      color: colors.textPrimary,
    },
    sectionAction: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
    },
    sectionActionText: {
      color: colors.textSecondary,
      fontWeight: "600",
    },
    badgeList: {
      gap: spacing.md,
    },
    badgeCard: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      gap: spacing.md,
    },
    badgeIcon: {
      width: 48,
      height: 48,
      borderRadius: radii.md,
      alignItems: "center",
      justifyContent: "center",
    },
    badgeBody: {
      flex: 1,
      gap: spacing.xs,
    },
    badgeTitle: {
      ...typography.body,
      color: colors.textPrimary,
      fontWeight: "600",
    },
    badgeDescription: {
      color: colors.textSecondary,
      fontSize: 13,
      lineHeight: 18,
    },
    paymentList: {
      gap: spacing.sm,
    },
    paymentNote: {
      color: colors.textSecondary,
      fontSize: 13,
      marginBottom: spacing.xs,
      fontStyle: "italic",
    },
    paymentCard: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: colors.card,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    paymentInfo: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
    },
    paymentLabel: {
      color: colors.textPrimary,
      fontWeight: "600",
    },
    addPaymentButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.sm,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.primary,
      paddingVertical: spacing.md,
    },
    addPaymentText: {
      color: colors.primary,
      fontWeight: "700",
    },
    preferenceList: {
      gap: spacing.sm,
    },
    comingSoonCard: {
      backgroundColor: colors.card,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.xl,
      alignItems: "center",
      gap: spacing.sm,
    },
    comingSoonTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    comingSoonText: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: "center",
      lineHeight: 20,
    },
    supportList: {
      gap: spacing.sm,
    },
    supportGroupSpacing: {
      marginBottom: spacing.md,
    },
    supportRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      gap: spacing.md,
    },
    supportRowDestructive: {
      borderColor: colors.danger + "66",
    },
    supportIcon: {
      width: 40,
      height: 40,
      borderRadius: radii.md,
      backgroundColor: colors.card,
      alignItems: "center",
      justifyContent: "center",
    },
    supportIconDestructive: {
      backgroundColor: colors.danger + "1A",
    },
    supportBody: {
      flex: 1,
      gap: spacing.xs,
    },
    supportLabel: {
      color: colors.textPrimary,
      fontWeight: "600",
    },
    supportLabelDestructive: {
      color: colors.danger,
    },
    supportDescription: {
      color: colors.textSecondary,
      fontSize: 13,
    },
    editSection: {
      backgroundColor: colors.card,
      borderRadius: radii.lg,
      padding: spacing.lg,
      gap: spacing.lg,
    },
    editSectionTitle: {
      ...typography.title,
      color: colors.textPrimary,
      fontSize: 18,
    },
    inputContainer: {
      gap: spacing.xs,
    },
    inputLabel: {
      color: colors.textPrimary,
      fontWeight: "600",
      fontSize: 14,
    },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.md,
      padding: spacing.md,
      color: colors.textPrimary,
      backgroundColor: colors.background,
      fontSize: 16,
    },
    inputDisabled: {
      backgroundColor: colors.surface,
      color: colors.textMuted,
      opacity: 0.7,
    },
    editActions: {
      flexDirection: "row",
      gap: spacing.md,
      marginTop: spacing.md,
    },
    editActionButton: {
      flex: 1,
      height: 44,
      borderRadius: radii.md,
      alignItems: "center",
      justifyContent: "center",
    },
    cancelButton: {
      backgroundColor: colors.border,
    },
    saveButton: {
      backgroundColor: colors.primary,
    },
    cancelButtonText: {
      color: colors.textSecondary,
      fontWeight: "600",
    },
    saveButtonText: {
      color: colors.card,
      fontWeight: "600",
    },
    signOutButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.sm,
      padding: spacing.lg,
      backgroundColor: colors.card,
      borderRadius: radii.lg,
      marginTop: spacing.lg,
    },
    signOutText: {
      color: colors.danger,
      fontWeight: "600",
      fontSize: 16,
    },
    deleteAccountButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.sm,
      padding: spacing.lg,
      backgroundColor: colors.card,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.danger,
    },
    deleteAccountText: {
      color: colors.danger,
      fontWeight: "700",
      fontSize: 16,
    },
    deleteModalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.65)",
      justifyContent: "flex-end",
    },
    deleteModalContent: {
      backgroundColor: colors.card,
      borderTopLeftRadius: radii.lg,
      borderTopRightRadius: radii.lg,
      padding: spacing.lg,
      gap: spacing.md,
    },
    deleteModalTitle: {
      ...typography.title,
      color: colors.textPrimary,
    },
    deleteModalDescription: {
      color: colors.textSecondary,
      fontSize: 14,
      lineHeight: 20,
    },
    deleteInput: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.md,
      padding: spacing.md,
      color: colors.textPrimary,
      backgroundColor: colors.background,
      fontSize: 15,
    },
    deleteReasonInput: {
      minHeight: 72,
      textAlignVertical: "top",
    },
    deleteModalActions: {
      flexDirection: "row",
      gap: spacing.md,
      marginTop: spacing.sm,
    },
    deleteCancelButton: {
      flex: 1,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: spacing.md,
    },
    deleteCancelText: {
      color: colors.textSecondary,
      fontWeight: "600",
    },
    deleteConfirmButton: {
      flex: 1,
      borderRadius: radii.md,
      backgroundColor: colors.danger,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: spacing.md,
    },
    passwordUpdateButton: {
      backgroundColor: colors.primary,
    },
    passwordInputWrap: {
      position: "relative",
      justifyContent: "center",
    },
    passwordToggleButton: {
      position: "absolute",
      right: spacing.md,
      height: "100%",
      justifyContent: "center",
      alignItems: "center",
    },
    themeOptionRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
    },
    themeOptionLabel: {
      color: colors.textPrimary,
      fontWeight: "600",
      fontSize: 15,
    },
    deleteConfirmText: {
      color: colors.card,
      fontWeight: "700",
    },
    avatarContainer: {
      position: "relative",
    },
    avatarOverlay: {
      position: "absolute",
      bottom: 0,
      right: 0,
      backgroundColor: colors.primary,
      borderRadius: radii.sm,
      width: 28,
      height: 28,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 2,
      borderColor: colors.card,
    },
  });
