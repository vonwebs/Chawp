import React, { useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { spacing, radii } from "../theme";
import { useTheme } from "../contexts/ThemeContext";

const { width } = Dimensions.get("window");

export default function ChawpNotification({
  visible,
  type = "info", // 'success', 'error', 'warning', 'info'
  title,
  message,
  onClose,
  duration = 4000,
  actions = [], // Array of { text, onPress, style }
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const slideAnim = useRef(new Animated.Value(-200)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      // Slide in and fade in
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          tension: 50,
          friction: 8,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();

      // Auto dismiss if no actions
      if (actions.length === 0 && duration > 0) {
        const timer = setTimeout(() => {
          handleClose();
        }, duration);
        return () => clearTimeout(timer);
      }
    } else {
      handleClose();
    }
  }, [visible]);

  const handleClose = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: -200,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      if (onClose) onClose();
    });
  };

  if (!visible) return null;

  const getIconName = () => {
    switch (type) {
      case "success":
        return "checkmark-circle";
      case "error":
        return "alert-circle";
      case "warning":
        return "warning";
      default:
        return "information-circle";
    }
  };

  const getIconColor = () => {
    switch (type) {
      case "success":
        return "#10B981";
      case "error":
        return "#EF4444";
      case "warning":
        return "#F59E0B";
      default:
        return colors.primary;
    }
  };

  const getGradientColors = () => {
    switch (type) {
      case "success":
        return ["#10B98120", "#10B98110"];
      case "error":
        return ["#EF444420", "#EF444410"];
      case "warning":
        return ["#F59E0B20", "#F59E0B10"];
      default:
        return [colors.primaryMuted + "20", colors.primary + "10"];
    }
  };

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY: slideAnim }],
          opacity: fadeAnim,
        },
      ]}
    >
      <LinearGradient
        colors={getGradientColors()}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <View style={styles.content}>
          {/* Logo & Icon Section */}
          <View style={styles.iconSection}>
            <View style={styles.logoContainer}>
              <LinearGradient
                colors={[colors.primary, colors.primaryMuted]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.logoGradient}
              >
                <Text style={styles.logoText}>C</Text>
              </LinearGradient>
            </View>
            <View
              style={[
                styles.statusIcon,
                { backgroundColor: getIconColor() + "20" },
              ]}
            >
              <Ionicons name={getIconName()} size={24} color={getIconColor()} />
            </View>
          </View>

          {/* Text Content */}
          <View style={styles.textSection}>
            {title && <Text style={styles.title}>{title}</Text>}
            {message && <Text style={styles.message}>{message}</Text>}
          </View>

          {/* Close Button */}
          <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
            <Ionicons name="close" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Action Buttons */}
        {actions.length > 0 && (
          <View style={styles.actionsContainer}>
            {actions.map((action, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.actionButton,
                  action.style === "primary" && styles.actionButtonPrimary,
                  action.style === "destructive" &&
                    styles.actionButtonDestructive,
                ]}
                onPress={() => {
                  if (action.onPress) action.onPress();
                  handleClose();
                }}
              >
                <Text
                  style={[
                    styles.actionButtonText,
                    action.style === "primary" &&
                      styles.actionButtonTextPrimary,
                    action.style === "destructive" &&
                      styles.actionButtonTextDestructive,
                  ]}
                >
                  {action.text}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </LinearGradient>
    </Animated.View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    container: {
      position: "absolute",
      top: 50,
      left: spacing.lg,
      right: spacing.lg,
      zIndex: 9999,
      elevation: 10,
    },
    gradient: {
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 8,
    },
    content: {
      flexDirection: "row",
      alignItems: "flex-start",
      padding: spacing.md,
    },
    iconSection: {
      flexDirection: "row",
      alignItems: "center",
      marginRight: spacing.sm,
    },
    logoContainer: {
      width: 36,
      height: 36,
      borderRadius: 18,
      overflow: "hidden",
      marginRight: spacing.xs,
    },
    logoGradient: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
    },
    logoText: {
      fontSize: 20,
      fontWeight: "bold",
      color: colors.card,
    },
    statusIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      justifyContent: "center",
      alignItems: "center",
    },
    textSection: {
      flex: 1,
      marginRight: spacing.sm,
    },
    title: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.textPrimary,
      marginBottom: spacing.xs / 2,
    },
    message: {
      fontSize: 14,
      color: colors.textSecondary,
      lineHeight: 20,
    },
    closeButton: {
      padding: spacing.xs / 2,
    },
    actionsContainer: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.md,
      paddingTop: spacing.xs,
      borderTopWidth: 1,
      borderTopColor: colors.border + "40",
    },
    actionButton: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radii.sm,
      backgroundColor: colors.cardElevated,
      borderWidth: 1,
      borderColor: colors.border,
    },
    actionButtonPrimary: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    actionButtonDestructive: {
      backgroundColor: "transparent",
      borderColor: "#EF4444",
    },
    actionButtonText: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.textPrimary,
    },
    actionButtonTextPrimary: {
      color: colors.card,
    },
    actionButtonTextDestructive: {
      color: "#EF4444",
    },
  });
