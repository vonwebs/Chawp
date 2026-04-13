/**
 * Push Notification Service for Chawp Customer App
 * Handles registration, permissions, and notification handling
 * Uses expo-notifications (disabled in Expo Go for SDK 53+)
 */

import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { supabase } from "../config/supabase";

// Conditionally import expo-notifications - will be null/fail in Expo Go
let Notifications = null;
try {
  Notifications = require("expo-notifications");

  // Configure how notifications are displayed when app is in foreground
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
} catch (error) {
  console.log("expo-notifications not available (expected in Expo Go SDK 53+)");
}

/**
 * Check if notifications are available (not in Expo Go)
 * @returns {boolean}
 */
function isNotificationsAvailable() {
  // Check if we're in Expo Go
  const isExpoGo = Constants.appOwnership === "expo";
  if (isExpoGo) {
    console.log("Running in Expo Go - notifications disabled");
    return false;
  }
  return Notifications !== null;
}

/**
 * Register for push notifications and get token
 * Works for both development and standalone/production apps
 * @returns {Promise<string|null>} Push token or null
 */
export async function registerForPushNotifications() {
  if (!isNotificationsAvailable()) {
    console.log("Notifications not available - skipping registration");
    return null;
  }

  let token = null;

  if (Platform.OS === "android") {
    // Create notification channels for Android
    await Notifications.setNotificationChannelAsync("orders", {
      name: "Orders",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#FF231F7C",
    });

    await Notifications.setNotificationChannelAsync("promotions", {
      name: "Promotions",
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250],
      lightColor: "#FFA500",
    });
  }

  if (Device.isDevice || Platform.OS === "web") {
    const { status: existingStatus } =
      await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      console.log("Failed to get push notification permission");
      return null;
    }

    // FCM-only mode: always use native device token retrieval.
    try {
      token = (await Notifications.getDevicePushTokenAsync()).data;
      console.log("FCM/APNs Device Push Token:", token);
    } catch (error) {
      console.error("Error getting native device token:", error);
      return null;
    }

    if (!token || typeof token !== "string") {
      console.error("Invalid native push token received");
      return null;
    }

    if (token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken[")) {
      console.error("Expo push token received in FCM-only mode; refusing token");
      return null;
    }
  } else {
    console.log("Must use physical device for Push Notifications");
  }

  return token;
}

/**
 * Save push token to user profile in database
 * @param {string} token - Native push token (FCM/APNs)
 * @param {string} userId - User ID
 */
export async function savePushToken(token, userId) {
  if (!token || !userId) return false;

  try {
    // Get device info
    const deviceInfo = {
      brand: Device.brand || "unknown",
      model: Device.modelName || "unknown",
      os: Device.osName || "unknown",
      osVersion: Device.osVersion || "unknown",
    };

    // Ensure profile row exists for FK integrity and audience filtering.
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error: profileUpsertError } = await supabase
      .from("chawp_user_profiles")
      .upsert(
        {
          id: userId,
          email: user?.email || null,
          full_name:
            user?.user_metadata?.full_name ||
            (user?.email ? user.email.split("@")[0] : null) ||
            "User",
          role: "user",
        },
        {
          onConflict: "id",
        },
      );

    if (profileUpsertError) {
      console.warn("Profile upsert before token save failed:", profileUpsertError);
    }

    // Save to device_tokens table with device type 'customer'
    console.log("Saving push token to device_tokens for customer app...");
    const { error: deviceError } = await supabase
      .from("chawp_device_tokens")
      .upsert(
        {
          user_id: userId,
          push_token: token,
          device_type: "customer",
          device_info: JSON.stringify(deviceInfo),
        },
        {
          onConflict: "user_id,device_type,push_token",
        },
      );

    if (deviceError) {
      console.error("Error saving to device_tokens:", deviceError);
    } else {
      console.log("Push token saved to device_tokens successfully");
    }

    // Also update user profile as fallback
    const { error } = await supabase
      .from("chawp_user_profiles")
      .upsert(
        {
          id: userId,
          email: user?.email || null,
          full_name:
            user?.user_metadata?.full_name ||
            (user?.email ? user.email.split("@")[0] : null) ||
            "User",
          role: "user",
          push_token: token,
          push_token_updated_at: new Date().toISOString(),
        },
        {
          onConflict: "id",
        },
      );

    if (error) throw error;
    console.log("Push token saved to profile successfully");
    return true;
  } catch (error) {
    console.error("Error saving push token:", error);
    return false;
  }
}

/**
 * Set up notification listeners
 * @param {Function} onNotificationReceived - Callback for received notifications
 * @param {Function} onNotificationTapped - Callback for tapped notifications
 * @returns {Object} Subscriptions object with listeners
 */
export function setupNotificationListeners(
  onNotificationReceived,
  onNotificationTapped,
) {
  if (!isNotificationsAvailable()) {
    console.log("Notifications not available - listeners disabled");
    return { remove: () => {} };
  }

  // Listener for notifications received while app is in foreground
  const notificationListener = Notifications.addNotificationReceivedListener(
    (notification) => {
      console.log("Notification received:", notification);
      if (onNotificationReceived) {
        onNotificationReceived(notification);
      }
    },
  );

  // Listener for when user taps on notification
  const responseListener =
    Notifications.addNotificationResponseReceivedListener((response) => {
      console.log("Notification tapped:", response);
      if (onNotificationTapped) {
        onNotificationTapped(response);
      }
    });

  return {
    notificationListener,
    responseListener,
    remove: () => {
      Notifications.removeNotificationSubscription(notificationListener);
      Notifications.removeNotificationSubscription(responseListener);
    },
  };
}

/**
 * Send a local notification (for testing)
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {object} data - Additional data
 */
export async function sendLocalNotification(title, body, data = {}) {
  if (!isNotificationsAvailable()) {
    console.log("Notifications not available");
    return;
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data,
      sound: true,
    },
    trigger: null, // Send immediately
  });
}

/**
 * Clear all notifications
 */
export async function clearAllNotifications() {
  if (!isNotificationsAvailable()) return;
  await Notifications.dismissAllNotificationsAsync();
}

/**
 * Get notification badge count
 */
export async function getBadgeCount() {
  if (!isNotificationsAvailable()) return 0;
  return await Notifications.getBadgeCountAsync();
}

/**
 * Set notification badge count
 * @param {number} count - Badge count
 */
export async function setBadgeCount(count) {
  if (!isNotificationsAvailable()) return;
  await Notifications.setBadgeCountAsync(count);
}
