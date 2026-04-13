import { Appearance, Dimensions, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const isSmallDevice = SCREEN_WIDTH < 375;
const isMediumDevice = SCREEN_WIDTH >= 375 && SCREEN_WIDTH < 414;

// Responsive font size helper
const responsiveFontSize = (size) => {
  if (isSmallDevice) return size * 0.9;
  if (isMediumDevice) return size;
  return size * 1.05;
};

const darkColors = {
  background: "#070B16",
  surface: "#0F1524",
  card: "#161D33",
  overlay: "rgba(10, 15, 27, 0.6)",
  primary: "#2E6BFF",
  primaryMuted: "#1F4FCC",
  accent: "#FFB547",
  accentMuted: "#FF9833",
  success: "#3DD598",
  danger: "#FF5C5C",
  textPrimary: "#F5F7FF",
  textSecondary: "#9AA3C0",
  textMuted: "#6C7796",
  border: "#1F2944",
  highlight: "#1F2A55",
};

const lightColors = {
  background: "#F4F7FF",
  surface: "#FFFFFF",
  card: "#eeeeee",
  overlay: "rgba(35, 47, 87, 0.12)",
  primary: "#2458E6",
  primaryMuted: "#1B45B5",
  accent: "#F39C2B",
  accentMuted: "#E98A1A",
  success: "#1FAF6B",
  danger: "#D74343",
  textPrimary: "#111827",
  textSecondary: "#4B5563",
  textMuted: "#6B7280",
  border: "#D6DEEF",
  highlight: "#DCE6FF",
};

export const themes = {
  dark: darkColors,
  light: lightColors,
};

const currentScheme = Appearance.getColorScheme();

export const colors = themes[currentScheme] || themes.dark;

export const THEME_MODE_STORAGE_KEY = "chawp-theme-mode";
export const THEME_MODES = {
  SYSTEM: "system",
  DARK: "dark",
  LIGHT: "light",
};

const isValidThemeMode = (mode) =>
  mode === THEME_MODES.SYSTEM ||
  mode === THEME_MODES.DARK ||
  mode === THEME_MODES.LIGHT;

export const getThemeModeLabel = (mode, resolvedMode = "dark") => {
  if (mode === THEME_MODES.SYSTEM) {
    return `Follow system (${resolvedMode})`;
  }
  if (mode === THEME_MODES.LIGHT) {
    return "Light";
  }
  return "Default dark";
};

export const getStoredThemeMode = async () => {
  try {
    const storedMode = await AsyncStorage.getItem(THEME_MODE_STORAGE_KEY);
    return isValidThemeMode(storedMode) ? storedMode : THEME_MODES.SYSTEM;
  } catch (error) {
    return THEME_MODES.SYSTEM;
  }
};

export const saveThemeMode = async (mode) => {
  const nextMode = isValidThemeMode(mode) ? mode : THEME_MODES.SYSTEM;
  await AsyncStorage.setItem(THEME_MODE_STORAGE_KEY, nextMode);
  return nextMode;
};

export const applyThemeMode = (mode) => {
  const safeMode = isValidThemeMode(mode) ? mode : THEME_MODES.SYSTEM;
  if (typeof Appearance.setColorScheme === "function") {
    try {
      // Android can crash with "parameter specified as non-null is null"
      // when passing null to setColorScheme. Theme switching is handled by
      // ThemeContext state, so skip native override on Android.
      if (Platform.OS !== "android") {
        if (safeMode === THEME_MODES.DARK || safeMode === THEME_MODES.LIGHT) {
          Appearance.setColorScheme(safeMode);
        } else {
          // Clear app override so OS changes are reflected in real time.
          Appearance.setColorScheme(null);
        }
      }
    } catch (_error) {
      // Ignore platform-specific failures and let context fallback handle colors.
    }
  }
  return safeMode;
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 20,
  xl: 28,
};

export const radii = {
  sm: 8,
  md: 14,
  lg: 24,
  pill: 999,
};

export const typography = {
  display: {
    fontSize: responsiveFontSize(32),
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  headline: {
    fontSize: responsiveFontSize(24),
    fontWeight: "700",
  },
  title: {
    fontSize: responsiveFontSize(18),
    fontWeight: "600",
  },
  body: {
    fontSize: responsiveFontSize(15),
    fontWeight: "500",
  },
  caption: {
    fontSize: responsiveFontSize(13),
    fontWeight: "500",
  },
};

// Export responsive helpers for use in components
export const responsive = {
  width: SCREEN_WIDTH,
  isSmallDevice,
  isMediumDevice,
  isLargeDevice: SCREEN_WIDTH >= 414,
  scale: (size) => responsiveFontSize(size),
};
