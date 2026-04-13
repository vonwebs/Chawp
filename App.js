import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import React, { useRef } from "react";
import {
  Appearance,
  BackHandler,
  Dimensions,
  FlatList,
  Image,
  Linking,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar as NativeStatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Constants from "expo-constants";

import { spacing, radii, typography, responsive } from "./src/theme";
import DiscoveryPage from "./src/pages/DiscoveryPage";
import OrdersPage from "./src/pages/OrdersPage";
import OrderHistoryPage from "./src/pages/OrderHistoryPage";
import ProfilePage from "./src/pages/ProfilePage";
import FoodPage from "./src/pages/FoodPage";
import VendorPage from "./src/pages/VendorPage";
import PrivacyPage from "./src/pages/PrivacyPage";
import AuthScreen from "./src/components/AuthScreen";
import PasswordResetScreen from "./src/components/PasswordResetScreen";
import ChawpLoading from "./src/components/ChawpLoading";
import LoadingPlaceholder from "./src/components/LoadingPlaceholder";
import EmptyState from "./src/components/EmptyState";
import PaystackModal from "./src/components/PaystackModal";
import { AuthProvider, useAuth } from "./src/contexts/AuthContext";
import { ThemeProvider, useTheme } from "./src/contexts/ThemeContext";
import {
  NotificationProvider,
  useNotification,
} from "./src/contexts/NotificationContext";
import {
  fetchVendors,
  fetchMeals,
  fetchCategories,
  fetchHeroCards,
  getCartItems,
  addToCart as apiAddToCart,
  updateCartItem as apiUpdateCartItem,
  removeFromCart as apiRemoveFromCart,
  clearCart as apiClearCart,
  updateUserProfile,
  fetchAppSettings,
} from "./src/services/api";
import { supabase } from "./src/config/supabase";
import {
  generatePaymentReference,
  initializePaystackPayment,
  getPaystackPublicKey,
  verifyPaymentAndCreateOrder,
  verifyPaymentForOrders,
  createPayAfterDeliveryOrder,
} from "./src/services/paystack";

// Responsive dimensions helper
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const isSmallDevice = SCREEN_WIDTH < 375;
const isMediumDevice = SCREEN_WIDTH >= 375 && SCREEN_WIDTH < 414;
const isLargeDevice = SCREEN_WIDTH >= 414;

// Responsive sizing functions
const responsiveWidth = (percent) => (SCREEN_WIDTH * percent) / 100;
const responsiveHeight = (percent) => (SCREEN_HEIGHT * percent) / 100;
const responsiveFontSize = (size) => {
  if (isSmallDevice) return size * 0.9;
  if (isMediumDevice) return size;
  return size * 1.05;
};

// Card width calculations for different screen sizes
const getCardWidth = () => {
  if (isSmallDevice) return SCREEN_WIDTH * 0.7; // 70% of screen width
  if (isMediumDevice) return SCREEN_WIDTH * 0.68; // 68% of screen width
  return 260; // Fixed width for large devices
};

const getQuickBiteColumns = () => {
  if (isSmallDevice) return 1;
  if (isMediumDevice) return 2;
  return 2;
};

const discoveryCollections = [
  {
    id: "late-night",
    title: "Late-night legends",
    description: "Curated picks for after-hours cravings",
    image:
      "https://images.unsplash.com/photo-1528712306091-ed0763094c98?auto=format&fit=crop&w=900&q=80",
  },
  {
    id: "plant-forward",
    title: "Plant-forward plates",
    description: "Vibrant flavors from vegan kitchens",
    image:
      "https://images.unsplash.com/photo-1528715471579-d1bcf0ba5e83?auto=format&fit=crop&w=900&q=80",
  },
  {
    id: "global-chefs",
    title: "Global chef tour",
    description: "Signature dishes from world-traveling chefs",
    image:
      "https://images.unsplash.com/photo-1476224203421-9ac39bcb3327?auto=format&fit=crop&w=900&q=80",
  },
];

const profileHighlights = [
  { id: "streak", label: "Order streak", value: "6 nights" },
  { id: "favorites", label: "Favorites saved", value: "12 spots" },
  { id: "reward", label: "Reward tier", value: "Glow Gold" },
];

const bottomNavItems = [
  { id: "home", label: "Home", icon: "home" },
  { id: "discover", label: "Discover", icon: "compass" },
  { id: "orders", label: "Orders", icon: "receipt" },
  { id: "profile", label: "Profile", icon: "person" },
];

const topInset =
  Platform.OS === "android"
    ? (NativeStatusBar.currentHeight || 0) + spacing.lg
    : spacing.lg;

const headerPaddingTop = Math.max(topInset - spacing.xl, spacing.sm);

const CART_NO_SIZE_KEY = "none";
const CART_SIZE_OPTIONS = ["small", "medium", "large", "extra_large"];

const normalizeCartSize = (size) => {
  if (typeof size !== "string") return null;
  const normalized = size.trim().toLowerCase();
  return normalized || null;
};

const normalizeOptionLabel = (option) => {
  if (typeof option === "string") {
    const trimmed = option.trim();
    return trimmed || null;
  }

  if (option && typeof option === "object") {
    const candidate =
      option.value || option.name || option.label || option.size || option.spec;
    const trimmed = String(candidate || "").trim();
    return trimmed || null;
  }

  return null;
};

const normalizeCartSpecifications = (specifications = []) => {
  if (!Array.isArray(specifications)) return [];

  return [
    ...new Set(
      specifications.map((spec) => String(spec || "").trim()).filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
};

const buildCartOptionsKey = (size, specifications = []) => {
  const normalizedSize = normalizeCartSize(size);
  const normalizedSpecs = normalizeCartSpecifications(specifications);
  const sizeKey = normalizedSize || CART_NO_SIZE_KEY;
  return `${sizeKey}::${normalizedSpecs.join("|")}`;
};

const isNoSizeOptionsKey = (optionsKey) =>
  typeof optionsKey === "string" &&
  optionsKey.startsWith(`${CART_NO_SIZE_KEY}::`);

const getMealSizeOptions = (meal = {}) => {
  const hasExplicitSizes =
    Array.isArray(meal.sizes) || Array.isArray(meal.available_sizes);

  const configuredSizes = Array.isArray(meal.sizes)
    ? meal.sizes
    : Array.isArray(meal.available_sizes)
      ? meal.available_sizes
      : [];

  const normalizedConfiguredSizes = [
    ...new Set(
      configuredSizes
        .map((size) => normalizeOptionLabel(size))
        .map((size) => normalizeCartSize(size)),
    ),
  ].filter(Boolean);

  if (hasExplicitSizes) {
    return normalizedConfiguredSizes;
  }

  const mealSize = normalizeCartSize(meal.size);

  if (mealSize && !CART_SIZE_OPTIONS.includes(mealSize)) {
    return [mealSize];
  }

  if (mealSize) {
    return [mealSize];
  }

  return [];
};

const getMealSpecificationOptions = (meal = {}) =>
  normalizeCartSpecifications(
    Array.isArray(meal.specifications)
      ? meal.specifications
          .map((specification) => normalizeOptionLabel(specification))
          .filter(Boolean)
      : meal.specifications
        ? [normalizeOptionLabel(meal.specifications)].filter(Boolean)
        : [],
  );

const normalizePriceAdjustments = (
  priceMap = {},
  normalizeKey = (key) => key,
) => {
  if (!priceMap || typeof priceMap !== "object" || Array.isArray(priceMap)) {
    return {};
  }

  const normalized = {};
  Object.entries(priceMap).forEach(([key, rawValue]) => {
    const normalizedKey = normalizeKey(String(key || "").trim());
    const value = Number(rawValue);
    if (!normalizedKey || !Number.isFinite(value) || value <= 0) return;
    normalized[normalizedKey] = Number(value.toFixed(2));
  });
  return normalized;
};

const parseVersionPart = (value) => {
  const parsed = Number.parseInt(String(value || "").replace(/\D/g, ""), 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

const compareVersions = (a = "0.0.0", b = "0.0.0") => {
  const aParts = String(a).split(".");
  const bParts = String(b).split(".");
  const maxLength = Math.max(aParts.length, bParts.length, 3);

  for (let i = 0; i < maxLength; i += 1) {
    const diff = parseVersionPart(aParts[i]) - parseVersionPart(bParts[i]);
    if (diff > 0) return 1;
    if (diff < 0) return -1;
  }

  return 0;
};

const getCurrentAppVersion = () =>
  String(
    Constants.expoConfig?.version ||
      Constants.manifest2?.extra?.expoClient?.version ||
      "0.0.0",
  );

const getMealPricingDetails = (
  meal = {},
  selectedSize = null,
  selectedSpecifications = [],
) => {
  const basePrice = Number(meal?.price || 0);
  const normalizedBasePrice = Number.isFinite(basePrice) ? basePrice : 0;

  const sizePriceMap = normalizePriceAdjustments(
    meal?.size_prices || {},
    (sizeKey) => normalizeCartSize(sizeKey),
  );
  const specificationPriceMap = normalizePriceAdjustments(
    meal?.specification_prices || {},
    (specKey) => specKey.trim().toLowerCase(),
  );

  const normalizedSize = normalizeCartSize(selectedSize);
  const normalizedSpecifications = normalizeCartSpecifications(
    selectedSpecifications,
  );

  const sizeAdjustment = normalizedSize
    ? Number(sizePriceMap[normalizedSize] || 0)
    : 0;
  const specificationAdjustment = normalizedSpecifications.reduce(
    (sum, specification) =>
      sum +
      Number(
        specificationPriceMap[String(specification).trim().toLowerCase()] || 0,
      ),
    0,
  );

  const unitPrice = Number(
    (normalizedBasePrice + sizeAdjustment + specificationAdjustment).toFixed(2),
  );

  return {
    basePrice: Number(normalizedBasePrice.toFixed(2)),
    sizeAdjustment: Number(sizeAdjustment.toFixed(2)),
    specificationAdjustment: Number(specificationAdjustment.toFixed(2)),
    totalAdjustment: Number(
      (sizeAdjustment + specificationAdjustment).toFixed(2),
    ),
    unitPrice,
  };
};

const computeServiceFeeAmount = (settings = {}, subtotal = 0) => {
  const normalizedSubtotal = Number(subtotal || 0);
  if (!Number.isFinite(normalizedSubtotal) || normalizedSubtotal <= 0) {
    return 0;
  }

  const mode =
    settings?.serviceFeeMode === "percentage" ? "percentage" : "flat";

  if (mode === "percentage") {
    const percentage = Number(settings?.serviceFeePercentage || 0);
    if (!Number.isFinite(percentage) || percentage <= 0) return 0;
    return Number(((normalizedSubtotal * percentage) / 100).toFixed(2));
  }

  const flatFee = Number(settings?.serviceFee || 0);
  if (!Number.isFinite(flatFee) || flatFee <= 0) return 0;
  return Number(flatFee.toFixed(2));
};

const isVendorUnavailable = (vendor = {}) => {
  const normalizedStatus = String(
    vendor?.operational_status || vendor?.status || "",
  ).toLowerCase();

  const closedStatuses = [
    "closed",
    "inactive",
    "suspended",
    "temporarily_closed",
  ];

  const isClosedToday =
    vendor?.is_closed_today === true ||
    String(vendor?.is_closed_today || "").toLowerCase() === "true" ||
    Number(vendor?.is_closed_today) === 1;

  const hasClosedOpenFlag =
    vendor?.is_open === false || vendor?.currently_open === false;

  return (
    closedStatuses.includes(normalizedStatus) ||
    isClosedToday ||
    hasClosedOpenFlag
  );
};

const hasOptionSelectionPayload = (options = {}) => {
  if (!options || typeof options !== "object") return false;

  return (
    Object.prototype.hasOwnProperty.call(options, "selectedSize") ||
    Object.prototype.hasOwnProperty.call(options, "size") ||
    Object.prototype.hasOwnProperty.call(options, "selectedSpecifications") ||
    Object.prototype.hasOwnProperty.call(options, "specifications") ||
    Boolean(options.optionsKey)
  );
};

const formatMealSize = (size) =>
  (normalizeCartSize(size) || "")
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const getCartItemOptions = (cartItem = {}) => {
  const existingOptionsKey =
    typeof cartItem.options_key === "string" ? cartItem.options_key : null;

  const fallbackMealSize =
    Array.isArray(cartItem.meal?.sizes) ||
    Array.isArray(cartItem.meal?.available_sizes)
      ? null
      : cartItem.meal?.size;

  const selectedSize = isNoSizeOptionsKey(existingOptionsKey)
    ? null
    : normalizeCartSize(cartItem.selected_size || fallbackMealSize);
  const selectedSpecifications = normalizeCartSpecifications(
    cartItem.selected_specifications || [],
  );
  const optionsKey =
    existingOptionsKey ||
    buildCartOptionsKey(selectedSize, selectedSpecifications);

  return {
    selectedSize,
    selectedSpecifications,
    optionsKey,
  };
};

const useThemedStyles = () => {
  const { resolvedColorScheme, colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  return { resolvedColorScheme, colors, styles };
};

function App() {
  const { resolvedColorScheme, colors, styles } = useThemedStyles();
  const statusBarStyle = resolvedColorScheme === "light" ? "dark" : "light";
  const [selectedNav, setSelectedNav] = React.useState("home");
  const [cartItems, setCartItems] = React.useState([]);
  const [cartLoading, setCartLoading] = React.useState(false);
  const [addingToCart, setAddingToCart] = React.useState(null); // Track which item is being added
  const [isCartOpen, setIsCartOpen] = React.useState(false);
  const [selectedMeal, setSelectedMeal] = React.useState(null);
  const [selectedVendor, setSelectedVendor] = React.useState(null);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [selectedCategory, setSelectedCategory] = React.useState(null);
  const [showFilterModal, setShowFilterModal] = React.useState(false);
  const [selectedLocation, setSelectedLocation] = React.useState("UPSA");
  const [showLocationPicker, setShowLocationPicker] = React.useState(false);
  const [showPrivacyPage, setShowPrivacyPage] = React.useState(false);
  const [isResettingPassword, setIsResettingPassword] = React.useState(false);
  const [showCartOptionsPicker, setShowCartOptionsPicker] =
    React.useState(false);
  const [pendingCartMeal, setPendingCartMeal] = React.useState(null);
  const [pendingCartSize, setPendingCartSize] = React.useState(null);
  const [pendingCartSpecifications, setPendingCartSpecifications] =
    React.useState([]);

  const {
    user,
    loading: authLoading,
    profile,
    updateProfile,
    setIsRecoveryMode,
  } = useAuth();
  const notification = useNotification();

  // Supabase data state
  const [vendors, setVendors] = React.useState([]);
  const [meals, setMeals] = React.useState([]);
  const [categories, setCategories] = React.useState([]);
  const [heroCards, setHeroCards] = React.useState([]);
  const [appSettings, setAppSettings] = React.useState({
    serviceFee: 6,
    serviceFeeMode: "flat",
    serviceFeePercentage: 0,
    deliveryFee: 5,
  });
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  // Auto-scroll for hero cards
  const heroScrollRef = useRef(null);
  const [currentHeroIndex, setCurrentHeroIndex] = React.useState(0);
  const heroCardsCount = heroCards.length || 4; // Number of hero cards

  // Handle deep links for password reset and OAuth
  React.useEffect(() => {
    let mounted = true;

    const handleDeepLink = async (url) => {
      console.log("Handling deep link:", url);
      if (!url) return;

      try {
        // Extract tokens from URL hash or query
        let params = null;
        if (url.includes("#")) {
          const hash = url.split("#")[1];
          params = new URLSearchParams(hash);
        } else if (url.includes("?")) {
          const query = url.split("?")[1];
          params = new URLSearchParams(query);
        }

        if (params) {
          const accessToken = params.get("access_token");
          const refreshToken = params.get("refresh_token");
          const type = params.get("type");

          console.log("Deep link params:", {
            hasAccessToken: !!accessToken,
            hasRefreshToken: !!refreshToken,
            type,
          });

          // Handle password reset
          if (accessToken && type === "recovery") {
            console.log("Processing password reset link");

            // CRITICAL: Set recovery mode FIRST before setting session
            // This prevents profile loading from invalidating the session
            if (mounted) {
              setIsResettingPassword(true);
              // Also set recovery mode in AuthContext to skip profile loading
              if (setIsRecoveryMode) {
                setIsRecoveryMode(true);
              }
              console.log("Password reset mode enabled");
            }

            // Small delay to ensure state is updated
            await new Promise((resolve) => setTimeout(resolve, 100));

            // Set the session with the tokens from the email link
            const { data, error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken || "",
            });

            if (error) {
              console.error("Error setting session from deep link:", error);
              notification.error(
                "Session Error",
                "Failed to establish password reset session. Please try again.",
              );
              // Reset password reset mode if session failed
              if (mounted) {
                setIsResettingPassword(false);
                if (setIsRecoveryMode) {
                  setIsRecoveryMode(false);
                }
              }
            } else {
              console.log("Session set from deep link successfully");
              console.log("Session user:", data?.session?.user?.email);
              console.log(
                "Session access_token:",
                data?.session?.access_token?.substring(0, 20) + "...",
              );

              // Wait for session to fully persist before password reset screen validates it
              await new Promise((resolve) => setTimeout(resolve, 500));
              console.log(
                "Password reset screen should now be able to validate session",
              );
            }
          }
          // Handle OAuth (Google) sign-in
          else if (accessToken && refreshToken) {
            console.log("=== OAUTH AUTHENTICATION ===");
            console.log("Processing OAuth authentication");
            console.log("Access token length:", accessToken.length);
            console.log("Has refresh token:", !!refreshToken);

            // Set the session with the tokens from OAuth provider
            const { data, error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });

            if (error) {
              console.error("Error setting OAuth session:", error);
              // Clear any loading states
              if (mounted) {
                setLoading(false);
              }
            } else {
              console.log("✅ OAuth session established successfully");
              console.log("User ID:", data?.user?.id);
              console.log("User email:", data?.user?.email);
              console.log("Provider:", data?.user?.app_metadata?.provider);

              // The auth state listener will handle setting the user
              // and loading data, no need to do anything else here
            }
          }
        }
      } catch (error) {
        console.error("Error processing deep link:", error);
      }
    };

    // Check for initial URL when app starts
    Linking.getInitialURL().then((url) => {
      if (url && mounted) {
        console.log("Initial URL:", url);
        handleDeepLink(url);
      }
    });

    // Listen for deep link URL changes
    const urlListener = Linking.addEventListener("url", (event) => {
      if (mounted) {
        console.log("Deep link URL:", event.url);
        handleDeepLink(event.url);
      }
    });

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("Auth event:", event);
      if (event === "PASSWORD_RECOVERY" && mounted) {
        console.log("PASSWORD_RECOVERY event detected");
        setIsResettingPassword(true);
      } else if (event === "USER_UPDATED" && mounted) {
        // User has updated their password
        console.log("USER_UPDATED event - password may have been changed");
        // The PasswordResetScreen component will handle closing via onComplete
      }
    });

    return () => {
      mounted = false;
      urlListener.remove();
      subscription.unsubscribe();
    };
  }, []);

  // Register for push notifications when user logs in
  React.useEffect(() => {
    if (!user) return;

    let listeners = null;
    let isMounted = true;

    const initNotifications = async () => {
      try {
        const {
          registerForPushNotifications,
          savePushToken,
          setupNotificationListeners,
        } = await import("./src/services/notifications");

        const token = await registerForPushNotifications();
        if (token) {
          console.log("Push notification token:", token);
          const saveResult = await savePushToken(token, user.id);
          if (!saveResult) {
            console.warn("Push token was generated but failed to persist");
          }
        } else {
          console.warn("No push token returned from registration");
        }

        if (!isMounted) return;

        listeners = setupNotificationListeners(
          (notification) => {
            // Handle notification received while app is in foreground
            console.log("Notification received:", notification);
          },
          (response) => {
            // Handle notification tap
            console.log("Notification tapped:", response);
            const data = response.notification.request.content.data;

            // Navigate based on notification type
            if (data?.type === "order_update" && data?.orderId) {
              setSelectedNav("orders");
            } else if (data?.type === "promotion") {
              setSelectedNav("home");
            }
          },
        );
      } catch (err) {
        console.error("Failed to initialize push notifications:", err);
      }
    };

    initNotifications();

    return () => {
      isMounted = false;
      if (listeners?.remove) {
        listeners.remove();
      }
    };
  }, [user]);

  // Load user's saved address from profile
  React.useEffect(() => {
    if (profile?.address) {
      setSelectedLocation(profile.address);
    }
  }, [profile]);

  // Load data from Supabase on mount
  React.useEffect(() => {
    if (user && !isResettingPassword) {
      // Small delay to ensure session is fully established after OAuth
      // This helps prevent "JWT not found" errors on first request
      const loadTimeout = setTimeout(() => {
        loadData();
        loadCartItems();
      }, 500);

      return () => clearTimeout(loadTimeout);
    } else if (!user) {
      // Clear cart when user signs out
      setCartItems([]);
    }
  }, [user, isResettingPassword]);

  React.useEffect(() => {
    if (selectedNav !== "home") {
      setIsCartOpen(false);
    }
  }, [selectedNav]);

  // Handle Android back button press
  React.useEffect(() => {
    const backAction = () => {
      // Priority order: Cart > FoodPage > VendorPage > Exit
      if (isCartOpen) {
        setIsCartOpen(false);
        return true; // Prevent default back action
      }
      if (selectedMeal) {
        setSelectedMeal(null);
        return true;
      }
      if (selectedVendor) {
        setSelectedVendor(null);
        return true;
      }
      if (showPrivacyPage) {
        setShowPrivacyPage(false);
        return true;
      }
      // If on home screen, allow default back action (exit app)
      if (selectedNav === "home") {
        return false;
      }
      // Otherwise, go back to home
      setSelectedNav("home");
      return true;
    };

    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      backAction,
    );

    return () => backHandler.remove();
  }, [isCartOpen, selectedMeal, selectedVendor, showPrivacyPage, selectedNav]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      console.log("=== STARTING DATA LOAD ===");

      // Verify session is available before loading data
      const { data: sessionData } = await supabase.auth.getSession();
      console.log("Session check before data load:", {
        hasSession: !!sessionData?.session,
        userEmail: sessionData?.session?.user?.email,
      });

      console.log("Loading data - vendors, meals, categories...");

      // Load each data source with individual error handling for better debugging
      const startTime = Date.now();

      // Add timeout to prevent infinite loading (30 seconds - increased for slower connections)
      const timeoutMs = 30000;
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                "Data loading timed out. Please check your internet connection and try again.",
              ),
            ),
          timeoutMs,
        ),
      );

      // Fetch data in parallel with individual timing logs
      const dataPromise = (async () => {
        const withTiming = async (label, fn) => {
          const taskStart = Date.now();
          const data = await fn();
          const size = Array.isArray(data) ? data.length : "loaded";
          console.log(
            `✅ ${label} loaded in ${Date.now() - taskStart}ms (${size})`,
          );
          return data;
        };

        const [
          vendorsData,
          mealsData,
          categoriesData,
          heroCardsData,
          settingsData,
        ] = await Promise.all([
          withTiming("Vendors", () => fetchVendors("active")),
          withTiming("Meals", () => fetchMeals({ status: "available" })),
          withTiming("Categories", () => fetchCategories()),
          withTiming("Hero cards", () => fetchHeroCards()),
          withTiming("App settings", () => fetchAppSettings()),
        ]);

        return [
          vendorsData,
          mealsData,
          categoriesData,
          heroCardsData,
          settingsData,
        ];
      })();

      const [
        vendorsData,
        mealsData,
        categoriesData,
        heroCardsData,
        settingsData,
      ] = await Promise.race([dataPromise, timeoutPromise]);

      console.log(
        `✅ All data loaded in ${Date.now() - startTime}ms: ${vendorsData.length} vendors, ${mealsData.length} meals, ${categoriesData.length} categories, ${heroCardsData.length} hero cards`,
      );

      setVendors(vendorsData);
      setMeals(mealsData);
      setCategories(categoriesData);
      setHeroCards(heroCardsData);
      setAppSettings(settingsData);

      // Prefetch first-screen images to reduce visual loading after startup.
      const heroImages = (heroCardsData || [])
        .slice(0, 4)
        .map((card) => card?.image_url)
        .filter(Boolean);
      const mealImages = (mealsData || [])
        .slice(0, 8)
        .map((meal) => meal?.image)
        .filter(Boolean);

      const prefetchTargets = [...new Set([...heroImages, ...mealImages])];
      if (prefetchTargets.length > 0) {
        Promise.allSettled(
          prefetchTargets.map((url) => Image.prefetch(url)),
        ).catch(() => {
          // Ignore prefetch errors to avoid impacting primary data load.
        });
      }

      // Debug: Check if vendor operational_status is being fetched
      console.log("Sample meal with vendor:", mealsData[0]?.vendor);
      console.log("=== DATA LOAD COMPLETE ===");
    } catch (err) {
      console.error("=== DATA LOAD ERROR ===");
      console.error("Error type:", err.constructor.name);
      console.error("Error message:", err.message);
      console.error("Full error:", err);

      const errorMsg =
        err.message ||
        "Failed to load data. Please check your internet connection.";
      setError(errorMsg);

      // Show user-friendly notification
      console.error("Showing error to user:", errorMsg);
    } finally {
      console.log("=== Setting loading to false ===");
      setLoading(false);
    }
  };

  const loadCartItems = async () => {
    try {
      setCartLoading(true);
      const cartData = await getCartItems();
      setCartItems(cartData);
      return cartData;
    } catch (error) {
      console.error("Error loading cart items:", error);
      // Don't show error to user for cart loading failures
      return [];
    } finally {
      setCartLoading(false);
    }
  };

  // Auto-scroll hero cards
  React.useEffect(() => {
    const interval = setInterval(() => {
      if (heroScrollRef.current) {
        const nextIndex = (currentHeroIndex + 1) % heroCardsCount;
        setCurrentHeroIndex(nextIndex);

        heroScrollRef.current.scrollTo({
          x: nextIndex * (SCREEN_WIDTH * 0.85 + spacing.md),
          animated: true,
        });
      }
    }, 4000); // Auto-scroll every 4 seconds

    return () => clearInterval(interval);
  }, [currentHeroIndex, heroCardsCount]);

  // Authentication checks

  const quickColumns = React.useMemo(() => {
    const columns = [[], []];
    meals.forEach((item, index) => {
      columns[index % 2].push(item);
    });
    return columns;
  }, [meals]);

  // Filter meals and vendors based on search query
  const filteredMeals = React.useMemo(() => {
    let filtered = meals;

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter((meal) => {
        const matchesTitle = meal.title?.toLowerCase().includes(query);
        const matchesDescription = meal.description
          ?.toLowerCase()
          .includes(query);
        const matchesVendor = meal.vendor?.name?.toLowerCase().includes(query);
        const matchesTags = meal.tags?.some((tag) =>
          tag.toLowerCase().includes(query),
        );

        return (
          matchesTitle || matchesDescription || matchesVendor || matchesTags
        );
      });
    }

    // Apply category filter
    if (selectedCategory) {
      filtered = filtered.filter(
        (meal) => meal.category === selectedCategory.label,
      );
    }

    return filtered;
  }, [meals, searchQuery, selectedCategory]);

  const filteredVendors = React.useMemo(() => {
    if (!searchQuery.trim()) return vendors;

    const query = searchQuery.toLowerCase().trim();
    return vendors.filter((vendor) => {
      const matchesName = vendor.name?.toLowerCase().includes(query);
      const matchesDescription = vendor.description
        ?.toLowerCase()
        .includes(query);
      const matchesCuisine = vendor.cuisine?.toLowerCase().includes(query);
      const matchesTags = vendor.tags?.some((tag) =>
        tag.toLowerCase().includes(query),
      );

      return matchesName || matchesDescription || matchesCuisine || matchesTags;
    });
  }, [vendors, searchQuery]);

  const filteredQuickColumns = React.useMemo(() => {
    const columns = [[], []];
    filteredMeals.forEach((item, index) => {
      columns[index % 2].push(item);
    });
    return columns;
  }, [filteredMeals]);

  const pendingMealSizeOptions = React.useMemo(
    () => getMealSizeOptions(pendingCartMeal || {}),
    [pendingCartMeal],
  );

  const pendingMealSpecifications = React.useMemo(
    () => getMealSpecificationOptions(pendingCartMeal || {}),
    [pendingCartMeal],
  );

  const pendingCartPrice = React.useMemo(() => {
    if (!pendingCartMeal) return null;
    return getMealPricingDetails(
      pendingCartMeal,
      pendingCartSize,
      pendingCartSpecifications,
    );
  }, [pendingCartMeal, pendingCartSize, pendingCartSpecifications]);

  const cartList = React.useMemo(() => cartItems, [cartItems]);
  const cartQuantity = React.useMemo(
    () => cartList.reduce((sum, entry) => sum + entry.quantity, 0),
    [cartList],
  );
  const cartSubtotal = React.useMemo(
    () =>
      cartList.reduce((sum, entry) => {
        const { selectedSize, selectedSpecifications } =
          getCartItemOptions(entry);
        const pricing = getMealPricingDetails(
          entry.meal,
          selectedSize,
          selectedSpecifications,
        );
        return sum + pricing.unitPrice * Number(entry.quantity || 0);
      }, 0),
    [cartList],
  );
  const serviceFee = cartQuantity
    ? computeServiceFeeAmount(appSettings, cartSubtotal)
    : 0;
  const deliveryFee = cartQuantity ? appSettings.deliveryFee : 0;
  const cartTotal = cartSubtotal + serviceFee + deliveryFee;

  // Handle hero card button actions
  const handleHeroCardAction = React.useCallback((card) => {
    if (card.action_type === "navigate") {
      const pageMap = {
        discover: "discover",
        home: "home",
        orders: "orders",
        profile: "profile",
        settings: "profile",
      };
      const page = pageMap[card.action_value] || card.action_value;
      setSelectedNav(page);
    } else if (card.action_type === "whatsapp") {
      const phoneNumber = card.whatsapp_number || "233509330098";
      const message = encodeURIComponent(
        card.whatsapp_message || "Hi Chawp Team, I'd like to know more.",
      );

      const whatsappUrl = `https://wa.me/${phoneNumber}?text=${message}`;
      const whatsappAppUrl = `whatsapp://send?phone=${phoneNumber}&text=${message}`;

      Linking.openURL(whatsappAppUrl)
        .catch(() => {
          Linking.openURL(whatsappUrl).catch(() => {
            const emailUrl = `mailto:support@chawp.com?subject=${encodeURIComponent(card.title || "Inquiry")}&body=${message}`;
            Linking.openURL(emailUrl);
          });
        })
        .catch((err) => {
          alert(
            "Unable to open contact. Please try again or contact support@chawp.com",
          );
        });
    } else if (card.action_type === "url" && card.action_value) {
      Linking.openURL(card.action_value).catch(() => {
        alert("Unable to open link");
      });
    }
  }, []);

  const closeCartOptionsPicker = React.useCallback(() => {
    setShowCartOptionsPicker(false);
    setPendingCartMeal(null);
    setPendingCartSize(null);
    setPendingCartSpecifications([]);
  }, []);

  const performAddToCart = React.useCallback(
    async (item, options = {}) => {
      // Prevent adding items from closed vendors
      if (isVendorUnavailable(item.vendor)) {
        notification.warning(
          "Vendor Closed",
          `${item.vendor?.name || "This vendor"} is currently closed.`,
        );
        return;
      }

      const hasSelectedSize = Object.prototype.hasOwnProperty.call(
        options,
        "selectedSize",
      );
      const hasLegacySize = Object.prototype.hasOwnProperty.call(
        options,
        "size",
      );
      const selectedSize = hasSelectedSize
        ? normalizeCartSize(options.selectedSize)
        : hasLegacySize
          ? normalizeCartSize(options.size)
          : normalizeCartSize(item.size);
      const selectedSpecifications = normalizeCartSpecifications(
        options.selectedSpecifications || [],
      );
      const optionsKey =
        options.optionsKey ||
        buildCartOptionsKey(selectedSize, selectedSpecifications);
      const pricing = getMealPricingDetails(
        item,
        selectedSize,
        selectedSpecifications,
      );

      try {
        setAddingToCart(item.id); // Set loading state

        // Optimistically update cart count immediately for instant feedback
        const existingCartItem = cartItems.find((cartItem) => {
          const sameMeal =
            cartItem.meal?.id === item.id || cartItem.meal_id === item.id;
          if (!sameMeal) return false;

          return getCartItemOptions(cartItem).optionsKey === optionsKey;
        });

        if (existingCartItem) {
          // Update existing item quantity
          setCartItems((prev) =>
            prev.map((cartItem) =>
              cartItem.id === existingCartItem.id
                ? { ...cartItem, quantity: cartItem.quantity + 1 }
                : cartItem,
            ),
          );
        } else {
          // Add new item to cart optimistically
          setCartItems((prev) => [
            ...prev,
            {
              id: `temp-${item.id}-${optionsKey}`,
              meal_id: item.id,
              meal: item,
              quantity: 1,
              special_instructions: "",
              selected_size: selectedSize,
              selected_specifications: selectedSpecifications,
              options_key: optionsKey,
            },
          ]);
        }

        const specsText = selectedSpecifications.length
          ? ` with ${selectedSpecifications.length} specification${
              selectedSpecifications.length > 1 ? "s" : ""
            }`
          : "";
        const sizeText = selectedSize
          ? ` (${formatMealSize(selectedSize)})`
          : "";

        // Show success notification immediately
        notification.success(
          "Added to Cart",
          `${item.title || item.name || "Item"}${sizeText}${specsText} added at GH₵${pricing.unitPrice.toFixed(2)}.`,
        );

        // Perform actual API call in background
        apiAddToCart(item.id, 1, "", {
          selectedSize,
          selectedSpecifications,
          optionsKey,
        })
          .then(() => {
            // Reload cart to sync with database
            return loadCartItems();
          })
          .catch((error) => {
            console.error("Error adding to cart:", error);
            // Rollback optimistic update on error
            loadCartItems();
            notification.error(
              "Error",
              "Failed to add item to cart. Please try again.",
            );
          });
      } catch (error) {
        console.error("Error adding to cart:", error);
        notification.error(
          "Error",
          "Failed to add item to cart. Please try again.",
        );
      } finally {
        setAddingToCart(null); // Clear loading state immediately
      }
    },
    [notification, cartItems],
  );

  const addToCart = React.useCallback(
    async (item, options = {}) => {
      if (isVendorUnavailable(item.vendor)) {
        notification.warning(
          "Vendor Closed",
          `${item.vendor?.name || "This vendor"} is currently closed.`,
        );
        return;
      }

      if (!hasOptionSelectionPayload(options)) {
        const mealSizeOptions = getMealSizeOptions(item);
        const mealSpecifications = getMealSpecificationOptions(item);
        const shouldOpenPicker =
          mealSizeOptions.length > 1 || mealSpecifications.length > 0;

        const normalizedMealSize = normalizeCartSize(item.size);
        const initialSize = mealSizeOptions.includes(normalizedMealSize)
          ? normalizedMealSize
          : mealSizeOptions[0] || null;

        if (!shouldOpenPicker) {
          const autoSelectedSize = mealSizeOptions[0] || null;
          const autoSelectedSpecifications = [];
          const autoOptionsKey = buildCartOptionsKey(
            autoSelectedSize,
            autoSelectedSpecifications,
          );

          await performAddToCart(item, {
            selectedSize: autoSelectedSize,
            selectedSpecifications: autoSelectedSpecifications,
            optionsKey: autoOptionsKey,
          });
          return;
        }

        setPendingCartMeal(item);
        setPendingCartSize(initialSize);
        setPendingCartSpecifications([]);
        setShowCartOptionsPicker(true);
        return;
      }

      await performAddToCart(item, options);
    },
    [notification, performAddToCart],
  );

  const togglePendingSpecification = React.useCallback((specification) => {
    const normalizedSpec = String(specification || "").trim();
    if (!normalizedSpec) return;

    setPendingCartSpecifications((prev) => {
      if (prev.includes(normalizedSpec)) {
        return prev.filter((item) => item !== normalizedSpec);
      }

      return normalizeCartSpecifications([...prev, normalizedSpec]);
    });
  }, []);

  const confirmCartOptionSelection = React.useCallback(() => {
    if (!pendingCartMeal) return;

    const selectedSpecifications = normalizeCartSpecifications(
      pendingCartSpecifications,
    );
    const selectedSize = normalizeCartSize(pendingCartSize);
    const optionsKey = buildCartOptionsKey(
      selectedSize,
      selectedSpecifications,
    );
    const mealToAdd = pendingCartMeal;

    closeCartOptionsPicker();
    performAddToCart(mealToAdd, {
      selectedSize,
      selectedSpecifications,
      optionsKey,
    });
  }, [
    closeCartOptionsPicker,
    pendingCartMeal,
    pendingCartSize,
    pendingCartSpecifications,
    performAddToCart,
  ]);

  const updateCartQuantity = React.useCallback(
    async (cartItemId, delta) => {
      try {
        let resolvedCartItemId = cartItemId;
        let cartItem = cartItems.find((item) => item.id === resolvedCartItemId);
        if (!cartItem) return;

        // Resolve optimistic temp IDs before hitting UUID-based database queries.
        if (String(resolvedCartItemId).startsWith("temp-")) {
          const tempOptionsKey = getCartItemOptions(cartItem).optionsKey;
          const latestCartItems = await loadCartItems();
          const resolvedItem = latestCartItems.find((item) => {
            const sameMeal =
              item.meal_id === cartItem.meal_id ||
              item.meal?.id === cartItem.meal_id;
            if (!sameMeal) return false;
            return getCartItemOptions(item).optionsKey === tempOptionsKey;
          });

          if (!resolvedItem?.id) {
            notification.info("Syncing Cart", "Please try again in a moment.");
            return;
          }

          resolvedCartItemId = resolvedItem.id;
          cartItem = resolvedItem;
        }

        const newQuantity = cartItem.quantity + delta;
        if (newQuantity <= 0) {
          await apiRemoveFromCart(resolvedCartItemId);
          notification.info(
            "Removed from Cart",
            `${cartItem.meal?.name || "Item"} removed from your cart.`,
          );
        } else {
          await apiUpdateCartItem(resolvedCartItemId, newQuantity);
          notification.success(
            "Cart Updated",
            `${cartItem.meal?.name || "Item"} quantity updated.`,
          );
        }
        await loadCartItems(); // Reload cart from database
      } catch (error) {
        console.error("Error updating cart quantity:", error);
        notification.error("Error", "Failed to update cart. Please try again.");
      }
    },
    [cartItems, notification],
  );

  const clearCart = React.useCallback(
    async ({ silent = true, background = true } = {}) => {
      setCartItems([]); // Optimistic clear for instant UI response.

      const clearOnServer = async () => {
        try {
          await apiClearCart();
        } catch (error) {
          console.error("Error clearing cart:", error);
          // Re-sync cart from server if optimistic clear fails.
          await loadCartItems();

          if (!silent) {
            notification.error("Error", "Failed to clear cart. Please try again.");
          }
        }
      };

      if (background) {
        clearOnServer();
        return;
      }

      await clearOnServer();
    },
    [notification],
  );

  const openFoodPage = React.useCallback(
    (meal) => {
      const fallbackVendor =
        meal?.vendor ||
        vendors.find((candidate) => candidate.id === meal?.vendor_id) ||
        selectedVendor ||
        null;

      if (fallbackVendor) {
        setSelectedMeal({
          ...meal,
          vendor: {
            ...fallbackVendor,
            ...(meal?.vendor || {}),
          },
        });
        return;
      }

      setSelectedMeal(meal);
    },
    [vendors, selectedVendor],
  );

  const closeFoodPage = React.useCallback(() => {
    setSelectedMeal(null);
  }, []);

  const openVendorPage = React.useCallback((vendor) => {
    setSelectedVendor(vendor);
  }, []);

  const closeVendorPage = React.useCallback(() => {
    setSelectedVendor(null);
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ExpoStatusBar style={statusBarStyle} />
      <LinearGradient
        colors={[colors.background, colors.surface]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        {authLoading ? (
          <ChawpLoading />
        ) : isResettingPassword ? (
          <PasswordResetScreen
            onComplete={() => {
              setIsResettingPassword(false);
              // Also clear recovery mode in AuthContext
              if (setIsRecoveryMode) {
                setIsRecoveryMode(false);
              }
              // Load data after password reset is complete
              if (user) {
                loadData();
                loadCartItems();
              }
            }}
          />
        ) : !user ? (
          <AuthScreen />
        ) : loading ? (
          <ChawpLoading />
        ) : error ? (
          <View style={styles.errorContainer}>
            <Ionicons
              name="alert-circle-outline"
              size={64}
              color={colors.textMuted}
            />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={loadData}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Home page - always mounted, shown/hidden with styles to preserve scroll position */}
            <View
              style={[
                styles.pageLayer,
                selectedNav === "home" ? styles.pageVisible : styles.pageHidden,
              ]}
              pointerEvents={selectedNav === "home" ? "auto" : "none"}
            >
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContainer}
                removeClippedSubviews={true}
                maxToRenderPerBatch={10}
                updateCellsBatchingPeriod={50}
                windowSize={10}
              >
                <View style={[styles.headerInset, styles.header]}>
                  <View>
                    <Text style={styles.locationLabel}>Delivering to</Text>
                    <TouchableOpacity
                      style={styles.locationRow}
                      onPress={() => setShowLocationPicker(true)}
                    >
                      <Ionicons
                        name="location"
                        size={18}
                        color={colors.accent}
                      />
                      <Text style={styles.locationText}>
                        {selectedLocation}
                      </Text>
                      <Ionicons
                        name="chevron-down"
                        size={18}
                        color={colors.textSecondary}
                        style={styles.locationChevron}
                      />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.headerRight}>
                    <TouchableOpacity
                      style={styles.cartButton}
                      onPress={() => setIsCartOpen(true)}
                    >
                      <Ionicons
                        name="bag"
                        size={24}
                        color={colors.textPrimary}
                      />
                      {cartQuantity > 0 && (
                        <View style={styles.cartBadge}>
                          <Text style={styles.cartBadgeText}>
                            {cartQuantity}
                          </Text>
                        </View>
                      )}
                    </TouchableOpacity>
                    <Image
                      source={{
                        uri:
                          profile?.avatar_url ||
                          "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=200&q=80",
                      }}
                      style={styles.avatar}
                    />
                  </View>
                </View>

                <View style={styles.heroCard}>
                  <ScrollView
                    ref={heroScrollRef}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.heroScrollContainer}
                    decelerationRate="fast"
                    onScroll={(event) => {
                      const scrollX = event.nativeEvent.contentOffset.x;
                      const cardWidth = SCREEN_WIDTH * 0.85 + spacing.md;
                      const newIndex = Math.round(scrollX / cardWidth);
                      if (
                        newIndex !== currentHeroIndex &&
                        newIndex >= 0 &&
                        newIndex < heroCardsCount
                      ) {
                        setCurrentHeroIndex(newIndex);
                      }
                    }}
                    scrollEventThrottle={16}
                  >
                    {heroCards.length > 0 ? (
                      heroCards.map((card) => (
                        <View key={card.id} style={styles.heroItem}>
                          <LinearGradient
                            colors={[
                              card.gradient_start || colors.primaryMuted,
                              card.gradient_end || colors.primary,
                            ]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.heroGradient}
                          >
                            <View style={styles.heroCopy}>
                              <Text style={styles.heroTitle}>{card.title}</Text>
                              <Text style={styles.heroSubtitle}>
                                {card.subtitle}
                              </Text>
                              <TouchableOpacity
                                style={styles.heroButton}
                                onPress={() => handleHeroCardAction(card)}
                              >
                                <Text style={styles.heroButtonText}>
                                  {card.button_text || "Learn More"}
                                </Text>
                                <Ionicons
                                  name={card.icon || "arrow-forward"}
                                  size={16}
                                  color={colors.primary}
                                />
                              </TouchableOpacity>
                            </View>
                            <Image
                              source={{ uri: card.image_url }}
                              style={styles.heroImage}
                            />
                          </LinearGradient>
                        </View>
                      ))
                    ) : (
                      <>
                        {/* Fallback: Main Hero Card */}
                        <View style={styles.heroItem}>
                          <LinearGradient
                            colors={[colors.primaryMuted, colors.primary]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.heroGradient}
                          >
                            <View style={styles.heroCopy}>
                              <Text style={styles.heroTitle}>
                                Abi U dey hung?
                              </Text>
                              <Text style={styles.heroSubtitle}>
                                Get curated chef specials in under 30 minutes.
                              </Text>
                              <TouchableOpacity
                                style={styles.heroButton}
                                onPress={() => setSelectedNav("discover")}
                              >
                                <Text style={styles.heroButtonText}>
                                  Order now
                                </Text>
                                <Ionicons
                                  name="arrow-forward"
                                  size={16}
                                  color={colors.card}
                                />
                              </TouchableOpacity>
                            </View>
                            <Image
                              source={{
                                uri: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=400&q=80",
                              }}
                              style={styles.heroImage}
                            />
                          </LinearGradient>
                        </View>

                        {/* Fallback: Fast Delivery Card */}
                        <View style={styles.heroItem}>
                          <LinearGradient
                            colors={[colors.secondaryMuted, colors.secondary]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.heroGradient}
                          >
                            <View style={styles.heroCopy}>
                              <Text style={styles.heroTitle}>
                                Lightning Fast
                              </Text>
                              <Text style={styles.heroSubtitle}>
                                Express delivery within 15 minutes on campus.
                              </Text>
                              <TouchableOpacity
                                style={styles.heroButton}
                                onPress={() => setSelectedNav("discover")}
                              >
                                <Text style={styles.heroButtonText}>
                                  Order now
                                </Text>
                                <Ionicons
                                  name="flash"
                                  size={16}
                                  color={colors.card}
                                />
                              </TouchableOpacity>
                            </View>
                            <Image
                              source={{
                                uri: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?auto=format&fit=crop&w=400&q=80",
                              }}
                              style={styles.heroImage}
                            />
                          </LinearGradient>
                        </View>

                        {/* Fallback: Join Our Team Card */}
                        <View style={styles.heroItem}>
                          <LinearGradient
                            colors={[colors.accentMuted, colors.accent]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.heroGradient}
                          >
                            <View style={styles.heroCopy}>
                              <Text style={styles.heroTitle}>
                                Join Our Team
                              </Text>
                              <Text style={styles.heroSubtitle}>
                                Register as a vendor or delivery partner today.
                              </Text>
                              <TouchableOpacity
                                style={styles.heroButton}
                                onPress={() => {
                                  const phoneNumber = "233509330098";
                                  const message = encodeURIComponent(
                                    "Hi Chawp Team, I'm interested in registering as a vendor or delivery partner. Please provide more information.",
                                  );

                                  const whatsappUrl = `https://wa.me/${phoneNumber}?text=${message}`;
                                  const whatsappAppUrl = `whatsapp://send?phone=${phoneNumber}&text=${message}`;

                                  Linking.openURL(whatsappAppUrl)
                                    .catch(() => {
                                      Linking.openURL(whatsappUrl).catch(() => {
                                        const emailUrl = `mailto:support@chawp.com?subject=Vendor/Delivery Registration&body=${message}`;
                                        Linking.openURL(emailUrl);
                                      });
                                    })
                                    .catch(() => {
                                      alert(
                                        "Unable to open contact. Please try again or contact support@chawp.com",
                                      );
                                    });
                                }}
                              >
                                <Text style={styles.heroButtonText}>
                                  Contact Us
                                </Text>
                                <Ionicons
                                  name="people"
                                  size={16}
                                  color={colors.card}
                                />
                              </TouchableOpacity>
                            </View>
                            <Image
                              source={{
                                uri: "https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=400&q=80",
                              }}
                              style={styles.heroImage}
                            />
                          </LinearGradient>
                        </View>

                        {/* Fallback: Advertise Your Business Card */}
                        <View style={styles.heroItem}>
                          <LinearGradient
                            colors={[colors.highlight, colors.primary]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.heroGradient}
                          >
                            <View style={styles.heroCopy}>
                              <Text style={styles.heroTitle}>
                                Advertise Your Business
                              </Text>
                              <Text style={styles.heroSubtitle}>
                                Reach thousands of students on campus daily.
                              </Text>
                              <TouchableOpacity
                                style={styles.heroButton}
                                onPress={() => {
                                  const phoneNumber = "233509330098";
                                  const message = encodeURIComponent(
                                    "Hi Chawp Team, I'm interested in advertising my business on your platform. Please provide information about advertising options and pricing.",
                                  );

                                  const whatsappUrl = `https://wa.me/${phoneNumber}?text=${message}`;
                                  const whatsappAppUrl = `whatsapp://send?phone=${phoneNumber}&text=${message}`;

                                  Linking.openURL(whatsappAppUrl)
                                    .catch(() => {
                                      Linking.openURL(whatsappUrl).catch(() => {
                                        const emailUrl = `mailto:support@chawp.com?subject=Business Advertising Inquiry&body=${message}`;
                                        Linking.openURL(emailUrl);
                                      });
                                    })
                                    .catch(() => {
                                      alert(
                                        "Unable to open contact. Please try again or contact support@chawp.com",
                                      );
                                    });
                                }}
                              >
                                <Text style={styles.heroButtonText}>
                                  Get Started
                                </Text>
                                <Ionicons
                                  name="megaphone"
                                  size={16}
                                  color={colors.card}
                                />
                              </TouchableOpacity>
                            </View>
                            <Image
                              source={{
                                uri: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=400&q=80",
                              }}
                              style={styles.heroImage}
                            />
                          </LinearGradient>
                        </View>
                      </>
                    )}
                  </ScrollView>

                  {/* Hero Pagination Dots */}
                  <View style={styles.heroPagination}>
                    {Array.from({ length: heroCardsCount }).map((_, index) => (
                      <TouchableOpacity
                        key={index}
                        style={[
                          styles.heroDot,
                          currentHeroIndex === index && styles.heroDotActive,
                        ]}
                        onPress={() => {
                          setCurrentHeroIndex(index);
                          heroScrollRef.current?.scrollTo({
                            x: index * (SCREEN_WIDTH * 0.85 + spacing.md),
                            animated: true,
                          });
                        }}
                      />
                    ))}
                  </View>
                </View>

                <View style={styles.searchCard}>
                  <Ionicons name="search" size={20} color={colors.textMuted} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search dishes, restaurants, or cuisines"
                    placeholderTextColor={colors.textMuted}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                  />
                  {searchQuery.length > 0 && (
                    <TouchableOpacity
                      style={styles.clearButton}
                      onPress={() => setSearchQuery("")}
                    >
                      <Ionicons
                        name="close-circle"
                        size={20}
                        color={colors.textMuted}
                      />
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={styles.filterButton}
                    onPress={() => setShowFilterModal(true)}
                  >
                    <MaterialCommunityIcons
                      name="tune-variant"
                      size={22}
                      color={colors.card}
                    />
                  </TouchableOpacity>
                </View>

                {searchQuery.trim().length > 0 && (
                  <View style={styles.searchResultsHeader}>
                    <Text style={styles.searchResultsText}>
                      Found {filteredMeals.length} meals and{" "}
                      {filteredVendors.length} restaurants
                    </Text>
                    <TouchableOpacity onPress={() => setSearchQuery("")}>
                      <Text style={styles.searchResultsClear}>
                        Clear search
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                {!searchQuery.trim() && !selectedCategory && (
                  <>
                    <SectionHeader
                      title="Tonight's mood"
                      actionLabel="See all"
                      onActionPress={() => setSelectedNav("discover")}
                    />
                    {categories.length === 0 ? (
                      <EmptyState
                        icon="fast-food-outline"
                        title="No categories available"
                        message="Categories will appear here once added"
                        style={{ marginHorizontal: spacing.lg }}
                      />
                    ) : (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.categoryScroll}
                        removeClippedSubviews={true}
                        decelerationRate="fast"
                      >
                        {categories.map((category) => (
                          <TouchableOpacity
                            key={category.id}
                            style={[
                              styles.categoryPill,
                              selectedCategory?.id === category.id &&
                                styles.categoryPillActive,
                            ]}
                            onPress={() => {
                              setSelectedCategory(category);
                              setSearchQuery("");
                            }}
                          >
                            <View
                              style={[
                                styles.categoryIconWrapper,
                                { backgroundColor: category.tint },
                              ]}
                            >
                              <MaterialCommunityIcons
                                name={category.icon}
                                size={20}
                                color={colors.textPrimary}
                              />
                            </View>
                            <Text style={styles.categoryLabel}>
                              {category.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    )}
                  </>
                )}

                {selectedCategory && (
                  <View style={styles.categoryFilterHeader}>
                    <Text style={styles.categoryFilterText}>
                      Showing {selectedCategory.label}
                    </Text>
                    <TouchableOpacity onPress={() => setSelectedCategory(null)}>
                      <Ionicons
                        name="close-circle"
                        size={24}
                        color={colors.accent}
                      />
                    </TouchableOpacity>
                  </View>
                )}

                <SectionHeader
                  title="Featured Vendors"
                  actionLabel="View all"
                  onActionPress={() => setSelectedNav("discover")}
                />
                {filteredVendors.length === 0 ? (
                  <EmptyState
                    icon="restaurant-outline"
                    title={
                      searchQuery
                        ? "No restaurants found"
                        : "No vendors available"
                    }
                    message={
                      searchQuery
                        ? `No restaurants match "${searchQuery}"`
                        : "Restaurants will appear here once added"
                    }
                    style={{ marginHorizontal: spacing.lg }}
                  />
                ) : (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.featuredScroll}
                    removeClippedSubviews={true}
                    decelerationRate="fast"
                  >
                    {filteredVendors.map((vendor) => (
                      <TouchableOpacity
                        key={`vendor-${vendor.id}`}
                        style={styles.restaurantCard}
                        onPress={() => openVendorPage(vendor)}
                        activeOpacity={0.8}
                      >
                        <Image
                          source={{ uri: vendor.image }}
                          style={styles.restaurantImage}
                        />
                        <View style={styles.restaurantBody}>
                          <View style={styles.restaurantTitleRow}>
                            <Text style={styles.restaurantName}>
                              {vendor.name}
                            </Text>
                            <View style={styles.ratingBadge}>
                              <Ionicons
                                name="star"
                                size={14}
                                color={colors.accent}
                              />
                              <Text style={styles.ratingText}>
                                {vendor.rating
                                  ? vendor.rating.toFixed(1)
                                  : "N/A"}
                              </Text>
                            </View>
                          </View>
                          <Text style={styles.restaurantMeta}>
                            {vendor.delivery_time} {"\u00B7"} {vendor.distance}
                          </Text>
                          <View style={styles.tagRow}>
                            {vendor.tags &&
                              vendor.tags.length > 0 &&
                              vendor.tags.map((tag) => (
                                <View key={tag} style={styles.tagPill}>
                                  <Text style={styles.tagText}>{tag}</Text>
                                </View>
                              ))}
                          </View>
                          {Boolean(vendor.promo) && (
                            <View style={styles.promoBadge}>
                              <Ionicons
                                name="flame"
                                size={14}
                                color={colors.accent}
                              />
                              <Text style={styles.promoText}>
                                {vendor.promo}
                              </Text>
                            </View>
                          )}
                        </View>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}

                <SectionHeader
                  title="Quick bites"
                  actionLabel="Browse"
                  onActionPress={() => setSelectedNav("discover")}
                />
                {filteredMeals.length === 0 ? (
                  <EmptyState
                    icon="fast-food-outline"
                    title={
                      searchQuery ? "No meals found" : "No meals available"
                    }
                    message={
                      searchQuery
                        ? `No meals match "${searchQuery}"`
                        : "Delicious meals will appear here once added"
                    }
                    style={{ marginHorizontal: spacing.lg }}
                  />
                ) : (
                  <View style={styles.quickGrid}>
                    {filteredQuickColumns.map((column, columnIndex) => (
                      <View
                        key={`quick-column-${columnIndex}`}
                        style={styles.quickColumn}
                      >
                        {column.map((item) => (
                          <TouchableOpacity
                            key={`meal-${item.id}`}
                            style={styles.quickCard}
                            onPress={() => openFoodPage(item)}
                            activeOpacity={0.8}
                          >
                            <View style={styles.quickImageContainer}>
                              <Image
                                source={{ uri: item.image }}
                                style={styles.quickImage}
                              />
                              {isVendorUnavailable(item.vendor) && (
                                <View style={styles.quickClosedOverlay}>
                                  <View style={styles.quickClosedBadge}>
                                    <Ionicons
                                      name="lock-closed"
                                      size={14}
                                      color={colors.card}
                                    />
                                    <Text style={styles.quickClosedText}>
                                      Closed
                                    </Text>
                                  </View>
                                </View>
                              )}
                            </View>
                            <View style={styles.quickBody}>
                              <Text style={styles.quickTitle}>
                                {item.title}
                              </Text>
                              {item.vendor && (
                                <View style={styles.quickVendorRow}>
                                  <Ionicons
                                    name="storefront-outline"
                                    size={12}
                                    color={colors.textSecondary}
                                  />
                                  <Text style={styles.quickVendorText}>
                                    {item.vendor.name}
                                  </Text>
                                </View>
                              )}
                              <View style={styles.quickMetaRow}>
                                {item.vendor?.rating != null && (
                                  <View style={styles.quickMetaItem}>
                                    <Ionicons
                                      name="star"
                                      size={12}
                                      color={colors.accent}
                                    />
                                    <Text style={styles.quickMetaMuted}>
                                      {Number(item.vendor.rating).toFixed(1)}
                                    </Text>
                                  </View>
                                )}
                                {Boolean(item.vendor?.delivery_time) && (
                                  <>
                                    <View style={styles.quickMetaDot} />
                                    <Text style={styles.quickMetaMuted}>
                                      {item.vendor.delivery_time}
                                    </Text>
                                  </>
                                )}
                              </View>
                              <View style={styles.quickFooter}>
                                <Text style={styles.quickPrice}>
                                  GH₵{item.price.toFixed(2)}
                                </Text>
                                <TouchableOpacity
                                  style={[
                                    styles.quickAddButton,
                                    (addingToCart === item.id ||
                                      isVendorUnavailable(item.vendor)) && {
                                      opacity: 0.5,
                                    },
                                  ]}
                                  onPress={() => addToCart(item)}
                                  disabled={
                                    addingToCart === item.id ||
                                    isVendorUnavailable(item.vendor)
                                  }
                                >
                                  {addingToCart === item.id ? (
                                    <LoadingPlaceholder
                                      width={18}
                                      height={18}
                                      borderRadius={9}
                                    />
                                  ) : (
                                    <Ionicons
                                      name={
                                        isVendorUnavailable(item.vendor)
                                          ? "lock-closed"
                                          : "add"
                                      }
                                      size={18}
                                      color={colors.card}
                                    />
                                  )}
                                </TouchableOpacity>
                              </View>
                            </View>
                          </TouchableOpacity>
                        ))}
                      </View>
                    ))}
                  </View>
                )}
              </ScrollView>
            </View>

            {/* Other pages - always mounted, shown/hidden with styles to preserve scroll position */}
            <View
              style={[
                styles.pageLayer,
                selectedNav === "discover"
                  ? styles.pageVisible
                  : styles.pageHidden,
              ]}
              pointerEvents={selectedNav === "discover" ? "auto" : "none"}
            >
              <View style={styles.pageContainer}>
                <DiscoveryPage
                  onVendorSelect={openVendorPage}
                  onNavigate={(page) => {
                    // Map action_value to page names
                    const pageMap = {
                      discover: "discover",
                      home: "home",
                      orders: "orders",
                      vendors: "discover", // vendors are shown in discover
                      meals: "discover", // meals are shown in discover
                      profile: "profile",
                      settings: "profile", // settings are in profile
                    };
                    const targetPage = pageMap[page] || "discover";
                    setSelectedNav(targetPage);
                  }}
                />
              </View>
            </View>

            <View
              style={[
                styles.pageLayer,
                selectedNav === "orders"
                  ? styles.pageVisible
                  : styles.pageHidden,
              ]}
              pointerEvents={selectedNav === "orders" ? "auto" : "none"}
            >
              <View style={styles.pageContainer}>
                <OrdersPage />
              </View>
            </View>

            <View
              style={[
                styles.pageLayer,
                selectedNav === "profile"
                  ? styles.pageVisible
                  : styles.pageHidden,
              ]}
              pointerEvents={selectedNav === "profile" ? "auto" : "none"}
            >
              <View style={styles.pageContainer}>
                <ProfilePage
                  onNavigateToOrderHistory={() =>
                    setSelectedNav("order-history")
                  }
                  onOpenPrivacy={() => {
                    console.log("onOpenPrivacy called in App.js");
                    setShowPrivacyPage(true);
                    console.log("showPrivacyPage set to true");
                  }}
                />
              </View>
            </View>

            <View
              style={[
                styles.pageLayer,
                selectedNav === "order-history"
                  ? styles.pageVisible
                  : styles.pageHidden,
              ]}
              pointerEvents={selectedNav === "order-history" ? "auto" : "none"}
            >
              <View style={styles.pageContainer}>
                <OrderHistoryPage onBack={() => setSelectedNav("profile")} />
              </View>
            </View>
          </>
        )}

        <Modal
          visible={isCartOpen}
          transparent
          animationType="slide"
          onRequestClose={() => setIsCartOpen(false)}
        >
          <CartPage
            cartItems={cartList}
            cartSubtotal={cartSubtotal}
            serviceFee={serviceFee}
            serviceFeeMode={appSettings.serviceFeeMode}
            serviceFeePercentage={appSettings.serviceFeePercentage}
            deliveryFee={deliveryFee}
            cartTotal={cartTotal}
            payAfterDeliveryEnabled={appSettings.payAfterDeliveryEnabled}
            onUpdateQuantity={updateCartQuantity}
            onClose={() => setIsCartOpen(false)}
            onClearCart={clearCart}
            selectedLocation={selectedLocation}
          />
        </Modal>

        {!isCartOpen &&
          !selectedMeal &&
          !selectedVendor &&
          !showPrivacyPage &&
          !showLocationPicker &&
          !showCartOptionsPicker &&
          !authLoading &&
          !loading &&
          !isResettingPassword &&
          user && (
            <View style={styles.bottomNav}>
              {bottomNavItems.map((item) => {
                const isActive = item.id === selectedNav;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.bottomNavItem}
                    onPress={() => {
                      if (selectedNav !== item.id) {
                        setSelectedNav(item.id);
                      }
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isActive }}
                  >
                    <View
                      style={[styles.navChip, isActive && styles.navChipActive]}
                    >
                      <Ionicons
                        name={item.icon}
                        size={24}
                        color={isActive ? colors.primary : colors.textSecondary}
                      />
                      <Text
                        style={[
                          styles.navLabel,
                          isActive && styles.navLabelActive,
                        ]}
                      >
                        {item.label}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

        <Modal
          visible={!!selectedVendor}
          animationType="slide"
          onRequestClose={closeVendorPage}
        >
          {selectedVendor && (
            <VendorPage
              vendor={selectedVendor}
              onMealSelect={setSelectedMeal}
              onClose={closeVendorPage}
              cartItems={cartItems}
              addToCart={addToCart}
              updateCartQuantity={updateCartQuantity}
              addingToCart={addingToCart}
            />
          )}
        </Modal>

        <Modal
          visible={!!selectedMeal}
          animationType="slide"
          onRequestClose={closeFoodPage}
        >
          {selectedMeal && (
            <FoodPage
              meal={selectedMeal}
              vendorContext={selectedVendor}
              onAddToCart={addToCart}
              onClose={closeFoodPage}
              cartItems={cartItems}
              updateCartQuantity={updateCartQuantity}
              isAddingToCart={addingToCart === selectedMeal.id}
            />
          )}
        </Modal>

        {showCartOptionsPicker && pendingCartMeal && (
          <Modal
            visible={showCartOptionsPicker}
            transparent
            animationType="slide"
            onRequestClose={closeCartOptionsPicker}
          >
            <View style={styles.optionPickerOverlay}>
              <View style={styles.optionPickerSheet}>
                <View style={styles.optionPickerHeader}>
                  <Text style={styles.optionPickerTitle}>Customize Meal</Text>
                  <TouchableOpacity onPress={closeCartOptionsPicker}>
                    <Ionicons
                      name="close"
                      size={24}
                      color={colors.textSecondary}
                    />
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.optionPickerBody}>
                  <Text style={styles.optionPickerMealName}>
                    {pendingCartMeal.title}
                  </Text>

                  {pendingMealSizeOptions.length > 0 && (
                    <>
                      <Text style={styles.optionPickerSectionTitle}>
                        Choose Size
                      </Text>
                      <View style={styles.optionPickerChipWrap}>
                        {pendingMealSizeOptions.map((sizeOption) => {
                          const isActive = pendingCartSize === sizeOption;

                          return (
                            <TouchableOpacity
                              key={`size-option-${sizeOption}`}
                              style={[
                                styles.optionPickerChip,
                                isActive && styles.optionPickerChipActive,
                              ]}
                              onPress={() => setPendingCartSize(sizeOption)}
                            >
                              <Text
                                style={[
                                  styles.optionPickerChipText,
                                  isActive && styles.optionPickerChipTextActive,
                                ]}
                              >
                                {formatMealSize(sizeOption)}
                                {(() => {
                                  const sizePrice = getMealPricingDetails(
                                    pendingCartMeal,
                                    sizeOption,
                                    [],
                                  ).sizeAdjustment;
                                  return sizePrice > 0
                                    ? ` (+GH₵${sizePrice.toFixed(2)})`
                                    : "";
                                })()}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </>
                  )}

                  <Text style={styles.optionPickerSectionTitle}>
                    Choose Specifications
                  </Text>
                  {pendingMealSpecifications.length > 0 ? (
                    <View style={styles.optionPickerChipWrap}>
                      {pendingMealSpecifications.map((specification, index) => {
                        const isSelected =
                          pendingCartSpecifications.includes(specification);

                        return (
                          <TouchableOpacity
                            key={`spec-option-${index}`}
                            style={[
                              styles.optionPickerChip,
                              isSelected && styles.optionPickerChipActive,
                            ]}
                            onPress={() =>
                              togglePendingSpecification(specification)
                            }
                          >
                            <Text
                              style={[
                                styles.optionPickerChipText,
                                isSelected && styles.optionPickerChipTextActive,
                              ]}
                            >
                              {specification}
                              {(() => {
                                const specificationPrice =
                                  getMealPricingDetails(pendingCartMeal, null, [
                                    specification,
                                  ]).specificationAdjustment;
                                return specificationPrice > 0
                                  ? ` (+GH₵${specificationPrice.toFixed(2)})`
                                  : "";
                              })()}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ) : (
                    <Text style={styles.optionPickerHintText}>
                      No extra specifications available for this meal.
                    </Text>
                  )}

                  {pendingCartPrice ? (
                    <Text style={styles.optionPickerHintText}>
                      Selected unit price: GH₵
                      {pendingCartPrice.unitPrice.toFixed(2)}
                    </Text>
                  ) : null}
                </ScrollView>

                <View style={styles.optionPickerActions}>
                  <TouchableOpacity
                    style={[
                      styles.optionPickerButton,
                      styles.optionPickerCancelButton,
                    ]}
                    onPress={closeCartOptionsPicker}
                  >
                    <Text style={styles.optionPickerCancelText}>Cancel</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.optionPickerButton,
                      styles.optionPickerConfirmButton,
                      addingToCart === pendingCartMeal.id && { opacity: 0.6 },
                    ]}
                    onPress={confirmCartOptionSelection}
                    disabled={addingToCart === pendingCartMeal.id}
                  >
                    {addingToCart === pendingCartMeal.id ? (
                      <LoadingPlaceholder
                        width={18}
                        height={18}
                        borderRadius={9}
                      />
                    ) : (
                      <Text style={styles.optionPickerConfirmText}>
                        Add to Cart
                        {pendingCartPrice
                          ? ` • GH₵${pendingCartPrice.unitPrice.toFixed(2)}`
                          : ""}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        )}

        <Modal
          visible={showFilterModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowFilterModal(false)}
        >
          <FilterModal
            categories={categories}
            selectedCategory={selectedCategory}
            onSelectCategory={(category) => {
              setSelectedCategory(category);
              setShowFilterModal(false);
              setSearchQuery("");
            }}
            onClose={() => setShowFilterModal(false)}
          />
        </Modal>

        <Modal
          visible={showLocationPicker}
          transparent
          animationType="fade"
          onRequestClose={() => setShowLocationPicker(false)}
        >
          <LocationPicker
            selectedLocation={selectedLocation}
            onSelectLocation={async (location) => {
              setSelectedLocation(location);
              setShowLocationPicker(false);

              // Update user profile address in Supabase
              try {
                await updateUserProfile({ address: location });
                await updateProfile(); // Refresh profile to get latest data
                notification.success(
                  "Location Updated",
                  `Delivering to ${location}`,
                );
              } catch (error) {
                console.error("Error updating profile address:", error);
                notification.error(
                  "Update Failed",
                  "Location updated locally but couldn't save to profile",
                );
              }
            }}
            onClose={() => setShowLocationPicker(false)}
          />
        </Modal>

        <Modal
          visible={showPrivacyPage}
          animationType="slide"
          onRequestClose={() => setShowPrivacyPage(false)}
        >
          <PrivacyPage onClose={() => setShowPrivacyPage(false)} />
        </Modal>
      </LinearGradient>
    </SafeAreaView>
  );
}

const SectionHeader = React.memo(function SectionHeader({
  title,
  actionLabel,
  onActionPress,
}) {
  const { colors, styles } = useThemedStyles();
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {actionLabel && (
        <TouchableOpacity style={styles.sectionAction} onPress={onActionPress}>
          <Text style={styles.sectionActionText}>{actionLabel}</Text>
          <Ionicons
            name="chevron-forward"
            size={16}
            color={colors.textSecondary}
          />
        </TouchableOpacity>
      )}
    </View>
  );
});

function CartPage({
  cartItems,
  cartSubtotal,
  serviceFee,
  serviceFeeMode,
  serviceFeePercentage,
  deliveryFee,
  cartTotal,
  payAfterDeliveryEnabled,
  onUpdateQuantity,
  onClose,
  onClearCart,
  selectedLocation,
}) {
  const { colors, styles } = useThemedStyles();
  const { user, profile } = useAuth();
  const notification = useNotification();
  const [isExpanded, setIsExpanded] = React.useState(false);
  const [isScheduled, setIsScheduled] = React.useState(false);
  const [scheduledDate, setScheduledDate] = React.useState(new Date());
  const [showDatePicker, setShowDatePicker] = React.useState(false);
  const [showPaymentChoiceModal, setShowPaymentChoiceModal] =
    React.useState(false);
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [showPaymentModal, setShowPaymentModal] = React.useState(false);
  const [paymentReference, setPaymentReference] = React.useState("");
  const [paymentAccessCode, setPaymentAccessCode] = React.useState("");
  const [paymentOrderIds, setPaymentOrderIds] = React.useState([]);
  const [orderData, setOrderData] = React.useState(null);

  const buildOrderDetails = React.useCallback(
    () => ({
      deliveryAddress: profile.address || "UPSA Campus, Accra",
      deliveryLocation: selectedLocation || "UPSA",
      deliveryInstructions: "",
      scheduledFor: isScheduled ? scheduledDate.toISOString() : null,
      cartTotal: cartTotal,
      appSettings: {
        serviceFee,
        serviceFeeMode,
        serviceFeePercentage,
        deliveryFee,
      },
    }),
    [
      profile,
      selectedLocation,
      isScheduled,
      scheduledDate,
      cartTotal,
      serviceFee,
      serviceFeeMode,
      serviceFeePercentage,
      deliveryFee,
    ],
  );

  const startInstantPaymentFlow = React.useCallback(
    async (orderDetails) => {
      const reference = generatePaymentReference();
      setPaymentReference(reference);

      const initResult = await initializePaystackPayment({
        reference,
        orderData: orderDetails,
        amount: cartTotal,
      });

      if (!initResult?.accessCode) {
        throw new Error("Payment initialization did not return an access code");
      }

      setPaymentReference(initResult.reference || reference);
      setPaymentAccessCode(initResult.accessCode);
      setPaymentOrderIds(
        Array.isArray(initResult.orderIds) ? initResult.orderIds : [],
      );
      setShowPaymentModal(true);
    },
    [cartTotal],
  );

  const placePayAfterDeliveryOrderFlow = React.useCallback(
    async (orderDetails) => {
      const createResult = await createPayAfterDeliveryOrder({
        orderData: orderDetails,
      });

      if (!createResult?.success) {
        throw new Error(createResult?.error || "Failed to place order");
      }

      await onClearCart({ silent: true, background: true });
      onClose();
    },
    [onClearCart, onClose],
  );

  const handleCheckout = async () => {
    setIsProcessing(true);
    try {
      if (cartItems.length === 0) {
        notification.warning(
          "Cart Empty",
          "Please add items to your cart first.",
        );
        return;
      }

      if (!user || !profile) {
        notification.error(
          "Authentication Required",
          "Please sign in to continue.",
        );
        return;
      }

      const orderDetails = buildOrderDetails();
      setOrderData(orderDetails);

      if (payAfterDeliveryEnabled) {
        setShowPaymentChoiceModal(true);
        return;
      }

      await startInstantPaymentFlow(orderDetails);
    } catch (error) {
      console.error("Checkout error:", error);
      notification.error(
        "Checkout Failed",
        error.message || "An error occurred during checkout. Please try again.",
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleChoosePayInstantly = async () => {
    const orderDetails = orderData || buildOrderDetails();
    setShowPaymentChoiceModal(false);
    setIsProcessing(true);
    try {
      await startInstantPaymentFlow(orderDetails);
    } catch (error) {
      console.error("Instant pay selection error:", error);
      notification.error(
        "Checkout Failed",
        error.message || "Could not initialize payment. Please try again.",
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleChoosePayAfterDelivery = async () => {
    const orderDetails = orderData || buildOrderDetails();
    setShowPaymentChoiceModal(false);
    setIsProcessing(true);
    try {
      await placePayAfterDeliveryOrderFlow(orderDetails);
    } catch (error) {
      console.error("Pay-after-delivery selection error:", error);
      notification.error(
        "Checkout Failed",
        error.message || "Could not place order. Please try again.",
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePaymentSuccess = async (response) => {
    try {
      setShowPaymentModal(false);
      setPaymentAccessCode("");
      setIsProcessing(true);

      console.log("Payment successful:", response);
      console.log(
        "Payment reference:",
        response.transactionRef?.reference || paymentReference,
      );
      console.log("Order data:", orderData);

      const resolvedReference =
        response.transactionRef?.reference || paymentReference;

      // Verify through orderIds flow when fallback init created unpaid orders.
      const result =
        Array.isArray(paymentOrderIds) && paymentOrderIds.length > 0
          ? await verifyPaymentForOrders(resolvedReference, paymentOrderIds)
          : await verifyPaymentAndCreateOrder(resolvedReference, orderData);

      console.log("Verification result:", result);

      if (result.success) {
        await onClearCart({ silent: true, background: true });
        onClose();
        setPaymentOrderIds([]);
      }
    } catch (error) {
      console.error("Payment verification error:", error);
      console.error("Error details:", {
        message: error.message,
        stack: error.stack,
      });
      notification.error(
        "Verification Failed",
        error.message || "Could not verify payment. Please contact support.",
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePaymentCancel = () => {
    setShowPaymentModal(false);
    setPaymentAccessCode("");
    setPaymentOrderIds([]);
    notification.warning("Payment Cancelled", "Your payment was not completed");
  };

  return (
    <View style={styles.cartModal}>
      <View
        style={styles.cartOverlay}
        onTouchEnd={isExpanded ? undefined : onClose}
      />
      <View
        style={[styles.cartContent, isExpanded && styles.cartContentExpanded]}
      >
        <View style={styles.cartHandle}>
          <View style={styles.handleBar} />
        </View>

        <View style={styles.cartHeader}>
          <Text style={styles.cartTitle}>Your Cart</Text>
          <View style={styles.cartHeaderActions}>
            <TouchableOpacity
              style={styles.expandButton}
              onPress={() => setIsExpanded(!isExpanded)}
            >
              <Ionicons
                name={isExpanded ? "chevron-down" : "chevron-up"}
                size={24}
                color={colors.textPrimary}
              />
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>

        {cartItems.length === 0 ? (
          <View style={styles.emptyCart}>
            <Ionicons name="bag-outline" size={64} color={colors.textMuted} />
            <Text style={styles.emptyCartText}>Your cart is empty</Text>
            <Text style={styles.emptyCartSubtext}>
              Add items from restaurants to get started
            </Text>
          </View>
        ) : (
          <>
            <ScrollView
              style={styles.cartItemsList}
              showsVerticalScrollIndicator={false}
            >
              {cartItems.map((item) =>
                (() => {
                  const optionState = getCartItemOptions(item);
                  const pricing = getMealPricingDetails(
                    item.meal,
                    optionState.selectedSize,
                    optionState.selectedSpecifications,
                  );

                  return (
                    <View key={item.id} style={styles.cartItem}>
                      <Image
                        source={{ uri: item.meal.image }}
                        style={styles.cartItemImage}
                      />
                      <View style={styles.cartItemInfo}>
                        <Text style={styles.cartItemTitle}>
                          {item.meal.title}
                        </Text>
                        {optionState.selectedSize && (
                          <Text style={styles.cartItemOption}>
                            Size: {formatMealSize(optionState.selectedSize)}
                          </Text>
                        )}
                        {optionState.selectedSpecifications.length > 0 && (
                          <Text style={styles.cartItemOption} numberOfLines={1}>
                            Specs:{" "}
                            {optionState.selectedSpecifications.join(" • ")}
                          </Text>
                        )}
                        <Text style={styles.cartItemPrice}>
                          GH₵{pricing.unitPrice.toFixed(2)}
                        </Text>
                        {pricing.totalAdjustment > 0 ? (
                          <Text style={styles.cartItemOption}>
                            Includes +GH₵{pricing.totalAdjustment.toFixed(2)}{" "}
                            options
                          </Text>
                        ) : null}
                      </View>
                      <View style={styles.quantityControl}>
                        <TouchableOpacity
                          style={styles.quantityButton}
                          onPress={() => onUpdateQuantity(item.id, -1)}
                        >
                          <Ionicons
                            name="remove"
                            size={16}
                            color={colors.textPrimary}
                          />
                        </TouchableOpacity>
                        <Text style={styles.quantityText}>{item.quantity}</Text>
                        <TouchableOpacity
                          style={styles.quantityButton}
                          onPress={() => onUpdateQuantity(item.id, 1)}
                        >
                          <Ionicons
                            name="add"
                            size={16}
                            color={colors.textPrimary}
                          />
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })(),
              )}
            </ScrollView>

            <View style={styles.cartSummary}>
              {/* Delivery Location */}
              <View style={styles.deliveryLocationRow}>
                <Ionicons name="location" size={18} color={colors.accent} />
                <Text style={styles.deliveryLocationLabel}>Delivering to:</Text>
                <Text style={styles.deliveryLocationValue}>
                  {selectedLocation || "UPSA"}
                </Text>
              </View>

              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Subtotal</Text>
                <Text style={styles.summaryValue}>
                  GH₵{cartSubtotal.toFixed(2)}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>
                  {serviceFeeMode === "percentage"
                    ? `Service Fee (${Number(serviceFeePercentage || 0).toFixed(2)}%)`
                    : "Service Fee"}
                </Text>
                <Text style={styles.summaryValue}>
                  GH₵{serviceFee.toFixed(2)}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Delivery Fee</Text>
                <Text style={styles.summaryValue}>
                  GH₵{deliveryFee.toFixed(2)}
                </Text>
              </View>
              <View style={[styles.summaryRow, styles.totalRow]}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalValue}>GH₵{cartTotal.toFixed(2)}</Text>
              </View>
              {/* Schedule Delivery Option - Hidden for future updates */}
              {/*
              <View style={styles.scheduleSection}>
                <TouchableOpacity
                  style={styles.scheduleToggle}
                  onPress={() => setIsScheduled(!isScheduled)}
                >
                  <View style={styles.scheduleToggleLeft}>
                    <Ionicons
                      name={isScheduled ? "checkbox" : "square-outline"}
                      size={24}
                      color={
                        isScheduled ? colors.primary : colors.textSecondary
                      }
                    />
                    <Text style={styles.scheduleToggleText}>
                      Schedule for later
                    </Text>
                  </View>
                  <Ionicons
                    name="time-outline"
                    size={20}
                    color={colors.textSecondary}
                  />
                </TouchableOpacity>

                {isScheduled && (
                  <TouchableOpacity
                    style={styles.datePickerButton}
                    onPress={() => setShowDatePicker(true)}
                  >
                    <Ionicons
                      name="calendar-outline"
                      size={20}
                      color={colors.primary}
                    />
                    <Text style={styles.datePickerText}>
                      {scheduledDate.toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                        hour12: true,
                      })}
                    </Text>
                    <Ionicons
                      name="chevron-forward"
                      size={16}
                      color={colors.textSecondary}
                    />
                  </TouchableOpacity>
                )}
              </View>
              */}

              <TouchableOpacity
                style={[
                  styles.checkoutButton,
                  isProcessing && styles.checkoutButtonDisabled,
                ]}
                onPress={handleCheckout}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <LoadingPlaceholder width={18} height={18} borderRadius={9} />
                ) : (
                  <Text style={styles.checkoutButtonText}>
                    {payAfterDeliveryEnabled
                      ? "Place Order (Pay After Delivery)"
                      : "Proceed to Checkout"}
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.clearCartButton}
                onPress={() => {
                  onClearCart({ silent: true, background: true });
                  onClose();
                }}
              >
                <Text style={styles.clearCartButtonText}>Clear Cart</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* Simple Date/Time Picker Modal */}
        {showDatePicker && (
          <View style={styles.datePickerModal}>
            <View style={styles.datePickerContent}>
              <View style={styles.datePickerHeader}>
                <Text style={styles.datePickerTitle}>Schedule Delivery</Text>
                <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                  <Ionicons name="close" size={24} color={colors.textPrimary} />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.timeSlotsList}>
                {generateTimeSlots().map((slot) => (
                  <TouchableOpacity
                    key={slot.label}
                    style={styles.timeSlot}
                    onPress={() => {
                      setScheduledDate(slot.date);
                      setShowDatePicker(false);
                    }}
                  >
                    <Ionicons
                      name="time-outline"
                      size={20}
                      color={colors.primary}
                    />
                    <Text style={styles.timeSlotText}>{slot.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        )}

        {/* In-App Payment Modal */}
        {showPaymentModal && (
          <PaystackModal
            visible={showPaymentModal}
            paystackKey={getPaystackPublicKey()}
            email={user?.email || profile?.email || "customer@chawp.com"}
            amount={cartTotal}
            reference={paymentReference}
            accessCode={paymentAccessCode}
            metadata={{
              customerName:
                profile?.full_name || profile?.username || "Customer",
              phone: profile?.phone || "",
              orderType: "food_delivery",
              scheduled: isScheduled,
              itemCount: cartItems.length,
            }}
            onSuccess={handlePaymentSuccess}
            onCancel={handlePaymentCancel}
          />
        )}

        <Modal
          visible={showPaymentChoiceModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowPaymentChoiceModal(false)}
        >
          <View style={styles.paymentChoiceOverlay}>
            <View style={styles.paymentChoiceCard}>
              <Text style={styles.paymentChoiceTitle}>
                Choose Payment Option
              </Text>
              <Text style={styles.paymentChoiceDescription}>
                Pay now with Paystack, or place your order and pay after
                delivery.
              </Text>

              <View style={styles.paymentChoiceActions}>
                <TouchableOpacity
                  style={[
                    styles.paymentChoiceButton,
                    styles.paymentChoiceButtonPrimary,
                  ]}
                  onPress={handleChoosePayInstantly}
                  disabled={isProcessing}
                >
                  <Text style={styles.paymentChoiceButtonPrimaryText}>
                    Pay Instantly
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.paymentChoiceButton,
                    styles.paymentChoiceButtonSecondary,
                  ]}
                  onPress={handleChoosePayAfterDelivery}
                  disabled={isProcessing}
                >
                  <Text style={styles.paymentChoiceButtonSecondaryText}>
                    Pay After Delivery
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.paymentChoiceCancelButton}
                  onPress={() => setShowPaymentChoiceModal(false)}
                  disabled={isProcessing}
                >
                  <Text style={styles.paymentChoiceCancelText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </View>
  );
}

// Helper function to generate time slots
function generateTimeSlots() {
  const slots = [];
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinutes = now.getMinutes();

  // Today's slots (1 hour from now onwards)
  const startHour = currentMinutes < 30 ? currentHour + 1 : currentHour + 2;
  for (let hour = startHour; hour < 24; hour++) {
    const date = new Date(now);
    date.setHours(hour, 0, 0, 0);
    slots.push({
      label: `Today at ${date.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })}`,
      date: date,
    });
  }

  // Tomorrow's slots
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  for (let hour = 8; hour < 24; hour++) {
    const date = new Date(tomorrow);
    date.setHours(hour, 0, 0, 0);
    slots.push({
      label: `Tomorrow at ${date.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })}`,
      date: date,
    });
  }

  return slots.slice(0, 20); // Limit to 20 slots
}

function FilterModal({
  categories,
  selectedCategory,
  onSelectCategory,
  onClose,
}) {
  const { colors, styles } = useThemedStyles();
  return (
    <View style={styles.modalOverlay}>
      <View style={styles.modalContent}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Filter by Category</Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={28} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.modalBody}>
          <TouchableOpacity
            style={[
              styles.filterOption,
              !selectedCategory && styles.filterOptionActive,
            ]}
            onPress={() => onSelectCategory(null)}
          >
            <Ionicons
              name="apps-outline"
              size={24}
              color={!selectedCategory ? colors.accent : colors.textSecondary}
            />
            <Text
              style={[
                styles.filterOptionText,
                !selectedCategory && styles.filterOptionTextActive,
              ]}
            >
              All Categories
            </Text>
            {!selectedCategory && (
              <Ionicons
                name="checkmark-circle"
                size={24}
                color={colors.accent}
              />
            )}
          </TouchableOpacity>

          {categories.map((category) => (
            <TouchableOpacity
              key={category.id}
              style={[
                styles.filterOption,
                selectedCategory?.id === category.id &&
                  styles.filterOptionActive,
              ]}
              onPress={() => onSelectCategory(category)}
            >
              <View
                style={[
                  styles.filterIconWrapper,
                  { backgroundColor: category.tint },
                ]}
              >
                <MaterialCommunityIcons
                  name={category.icon}
                  size={20}
                  color={colors.textPrimary}
                />
              </View>
              <Text
                style={[
                  styles.filterOptionText,
                  selectedCategory?.id === category.id &&
                    styles.filterOptionTextActive,
                ]}
              >
                {category.label}
              </Text>
              {selectedCategory?.id === category.id && (
                <Ionicons
                  name="checkmark-circle"
                  size={24}
                  color={colors.accent}
                />
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>

        <TouchableOpacity style={styles.modalButton} onPress={onClose}>
          <Text style={styles.modalButtonText}>Close</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function LocationPicker({ selectedLocation, onSelectLocation, onClose }) {
  const { colors, styles } = useThemedStyles();
  const mainLocation = { id: "upsa", name: "UPSA", distance: "Current" };
  const subLocations = [
    { id: "hostel-a", name: "Hostel A", distance: "2 km" },
    { id: "hostel-b", name: "Hostel B", distance: "3 km" },
    { id: "hostel-c", name: "Hostel C", distance: "4 km" },
    { id: "campus", name: "Campus", distance: "1 km" },
  ];

  return (
    <View style={styles.modalOverlay}>
      <View style={styles.modalContent}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Select Delivery Location</Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={28} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.modalBody}>
          {/* Main Location - UPSA */}
          <TouchableOpacity
            style={[
              styles.filterOption,
              selectedLocation === mainLocation.name &&
                styles.filterOptionActive,
            ]}
            onPress={() => onSelectLocation(mainLocation.name)}
          >
            <Ionicons
              name="location"
              size={24}
              color={
                selectedLocation === mainLocation.name
                  ? colors.accent
                  : colors.textSecondary
              }
            />
            <View style={styles.locationInfo}>
              <Text
                style={[
                  styles.filterOptionText,
                  selectedLocation === mainLocation.name &&
                    styles.filterOptionTextActive,
                ]}
              >
                {mainLocation.name}
              </Text>
              <Text style={styles.locationDistance}>
                {mainLocation.distance}
              </Text>
            </View>
            {selectedLocation === mainLocation.name && (
              <Ionicons
                name="checkmark-circle"
                size={24}
                color={colors.accent}
              />
            )}
          </TouchableOpacity>

          {/* Sub-locations within UPSA */}
          <View style={styles.subLocationsSection}>
            <Text style={styles.subLocationsTitle}>Within UPSA</Text>
            {subLocations.map((location) => (
              <TouchableOpacity
                key={location.id}
                style={[
                  styles.filterOption,
                  styles.subLocationOption,
                  selectedLocation === location.name &&
                    styles.filterOptionActive,
                ]}
                onPress={() => onSelectLocation(location.name)}
              >
                <Ionicons
                  name="location-outline"
                  size={20}
                  color={
                    selectedLocation === location.name
                      ? colors.accent
                      : colors.textSecondary
                  }
                />
                <View style={styles.locationInfo}>
                  <Text
                    style={[
                      styles.filterOptionText,
                      styles.subLocationText,
                      selectedLocation === location.name &&
                        styles.filterOptionTextActive,
                    ]}
                  >
                    {location.name}
                  </Text>
                  <Text style={styles.locationDistance}>
                    {location.distance}
                  </Text>
                </View>
                {selectedLocation === location.name && (
                  <Ionicons
                    name="checkmark-circle"
                    size={24}
                    color={colors.accent}
                  />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        <TouchableOpacity style={styles.modalButton} onPress={onClose}>
          <Text style={styles.modalButtonText}>Close</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.background,
    },
    gradient: {
      flex: 1,
    },
    scrollContainer: {
      paddingTop: spacing.lg,
      paddingBottom: 100,
    },
    header: {
      paddingHorizontal: spacing.lg,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    headerInset: {
      paddingTop: headerPaddingTop,
    },
    locationLabel: {
      color: colors.textMuted,
      textTransform: "uppercase",
      letterSpacing: 1.4,
      fontSize: 12,
      fontWeight: "600",
    },
    locationRow: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: spacing.xs,
    },
    locationChevron: {
      marginLeft: spacing.xs,
    },
    locationText: {
      color: colors.textPrimary,
      fontSize: 18,
      fontWeight: "600",
      marginLeft: spacing.xs,
    },
    avatar: {
      width: 48,
      height: 48,
      borderRadius: radii.lg,
      borderWidth: 2,
      borderColor: colors.highlight,
    },
    heroCard: {
      marginTop: spacing.lg,
      paddingHorizontal: spacing.lg,
    },
    heroScrollContainer: {
      gap: spacing.md,
    },
    heroItem: {
      width: SCREEN_WIDTH * 0.86,
    },
    heroGradient: {
      borderRadius: radii.lg,
      padding: spacing.lg,
      flexDirection: "row",
      alignItems: "center",
      overflow: "hidden",
    },
    heroCopy: {
      flex: 1,
    },
    heroTitle: {
      ...typography.display,
      color: colors.textPrimary,
    },
    heroSubtitle: {
      marginTop: spacing.sm,
      color: colors.textPrimary,
      opacity: 0.8,
      lineHeight: 20,
    },
    heroButton: {
      marginTop: spacing.md,
      backgroundColor: colors.card,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.lg,
      borderRadius: radii.pill,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    heroButtonText: {
      color: colors.primary,
      fontWeight: "700",
      fontSize: 14,
      marginRight: spacing.xs,
    },
    heroImage: {
      width: 120,
      height: 120,
      borderRadius: 60,
      marginLeft: spacing.lg,
      borderWidth: 3,
      borderColor: "rgba(255, 255, 255, 0.3)",
      resizeMode: "cover",
    },
    heroPagination: {
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      marginTop: spacing.md,
      gap: spacing.sm,
    },
    heroDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.textMuted,
      opacity: 0.5,
    },
    heroDotActive: {
      backgroundColor: colors.primary,
      opacity: 1,
      transform: [{ scaleX: 1.5 }],
    },
    searchCard: {
      marginTop: spacing.lg,
      marginHorizontal: responsive.isSmallDevice ? spacing.md : spacing.lg,
      borderRadius: radii.md,
      backgroundColor: colors.surface,
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: responsive.isSmallDevice ? spacing.md : spacing.lg,
      height: 56,
      borderWidth: 1,
      borderColor: colors.border,
      gap: spacing.sm,
    },
    searchInput: {
      flex: 1,
      color: colors.textPrimary,
      fontSize: responsive.scale(15),
      fontWeight: "500",
    },
    clearButton: {
      padding: spacing.xs,
    },
    filterButton: {
      width: 42,
      height: 42,
      borderRadius: radii.md,
      backgroundColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    searchResultsHeader: {
      marginTop: spacing.lg,
      marginHorizontal: spacing.lg,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      backgroundColor: colors.surface,
      borderRadius: radii.sm,
      borderWidth: 1,
      borderColor: colors.border,
    },
    searchResultsText: {
      color: colors.textPrimary,
      fontSize: 14,
      fontWeight: "600",
    },
    searchResultsClear: {
      color: colors.accent,
      fontSize: 14,
      fontWeight: "600",
    },
    sectionHeader: {
      marginTop: spacing.xl,
      marginHorizontal: responsive.isSmallDevice ? spacing.md : spacing.lg,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    sectionTitle: {
      ...typography.headline,
      color: colors.textPrimary,
    },
    sectionAction: {
      flexDirection: "row",
      alignItems: "center",
    },
    sectionActionText: {
      color: colors.textSecondary,
      fontSize: 14,
      fontWeight: "600",
      marginRight: spacing.xs,
    },
    categoryScroll: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      gap: spacing.sm,
    },
    categoryPill: {
      marginRight: spacing.sm,
      backgroundColor: colors.card,
      borderRadius: radii.pill,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.border,
    },
    categoryPillActive: {
      backgroundColor: colors.primaryMuted,
      borderColor: colors.accent,
      borderWidth: 2,
    },
    categoryFilterHeader: {
      marginTop: spacing.lg,
      marginHorizontal: spacing.lg,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      backgroundColor: colors.primaryMuted,
      borderRadius: radii.sm,
      borderWidth: 1,
      borderColor: colors.accent,
    },
    categoryFilterText: {
      color: colors.textPrimary,
      fontSize: 14,
      fontWeight: "600",
    },
    categoryIconWrapper: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      marginRight: spacing.sm,
    },
    categoryLabel: {
      color: colors.textPrimary,
      fontWeight: "600",
      fontSize: 14,
    },
    featuredScroll: {
      paddingHorizontal: responsive.isSmallDevice ? spacing.md : spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.sm,
      gap: responsive.isSmallDevice ? spacing.md : spacing.lg,
    },
    restaurantCard: {
      width: getCardWidth(),
      backgroundColor: colors.card,
      borderRadius: radii.lg,
      marginRight: spacing.lg,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    restaurantImage: {
      width: "100%",
      height: isSmallDevice ? 120 : isMediumDevice ? 140 : 150,
      resizeMode: "cover",
    },
    restaurantBody: {
      padding: spacing.lg,
      gap: spacing.sm,
    },
    restaurantTitleRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    restaurantName: {
      ...typography.title,
      color: colors.textPrimary,
      flex: 1,
      marginRight: spacing.sm,
    },
    ratingBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      backgroundColor: colors.highlight,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: radii.sm,
    },
    ratingText: {
      color: colors.textPrimary,
      fontSize: 13,
      fontWeight: "600",
    },
    restaurantMeta: {
      color: colors.textSecondary,
      fontSize: 13,
    },
    tagRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.xs,
    },
    tagPill: {
      backgroundColor: colors.surface,
      borderRadius: radii.pill,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
    },
    tagText: {
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: "600",
    },
    promoBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      backgroundColor: "rgba(46, 107, 255, 0.12)",
      borderRadius: radii.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
    },
    promoText: {
      color: colors.textPrimary,
      fontSize: 12,
      fontWeight: "600",
    },
    quickGrid: {
      flexDirection: "row",
      paddingHorizontal: responsive.isSmallDevice ? spacing.md : spacing.lg,
      columnGap: responsive.isSmallDevice ? spacing.md : spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.xl,
    },
    quickColumn: {
      flex: 1,
      rowGap: responsive.isSmallDevice ? spacing.md : spacing.lg,
    },
    quickCard: {
      flex: 1,
      backgroundColor: colors.card,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    quickImageContainer: {
      position: "relative",
      width: "100%",
      height: 110,
      backgroundColor: colors.surface,
    },
    quickImage: {
      width: "100%",
      height: "100%",
      resizeMode: "cover",
    },
    quickClosedOverlay: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(0, 0, 0, 0.5)",
      justifyContent: "center",
      alignItems: "center",
    },
    quickClosedBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs / 2,
      backgroundColor: colors.error,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radii.md,
    },
    quickClosedText: {
      color: colors.card,
      fontSize: 13,
      fontWeight: "700",
      textTransform: "uppercase",
    },
    quickBody: {
      padding: spacing.md,
      gap: spacing.xs,
    },
    quickTitle: {
      color: colors.textPrimary,
      fontWeight: "600",
      fontSize: responsive.scale(16),
    },
    quickVendorRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs / 2,
      marginTop: spacing.xs / 2,
    },
    quickVendorText: {
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: "500",
    },
    quickMetaRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs / 2,
      marginTop: spacing.xs / 2,
    },
    quickMetaItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 2,
    },
    quickMetaDot: {
      width: 3,
      height: 3,
      borderRadius: 1.5,
      backgroundColor: colors.textMuted,
      marginHorizontal: spacing.xs / 2,
    },
    quickMeta: {
      color: colors.textSecondary,
      fontSize: 13,
    },
    quickMetaMuted: {
      color: colors.textMuted,
      fontSize: 12,
    },
    bottomNav: {
      position: "absolute",
      left: spacing.lg,
      right: spacing.lg,
      bottom: spacing.lg,
      backgroundColor: colors.surface,
      borderRadius: radii.lg,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.sm,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.border,
      gap: spacing.sm,
      shadowColor: "#000",
      shadowOpacity: 0.25,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 12 },
      elevation: 12,
      zIndex: 1000,
    },
    bottomNavItem: {
      flex: 1,
      alignItems: "center",
    },
    pageContainer: {
      flex: 1,
      width: "100%",
      paddingTop: headerPaddingTop,
      paddingBottom: spacing.xl * 2,
    },
    pageLayer: {
      ...StyleSheet.absoluteFillObject,
    },
    pageVisible: {
      opacity: 1,
      zIndex: 1,
    },
    pageHidden: {
      opacity: 0,
      zIndex: 0,
    },
    navChip: {
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.xs / 2,
      borderRadius: radii.md,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.xs,
    },
    navChipActive: {
      backgroundColor: "transparent",
    },
    navLabel: {
      color: colors.textSecondary,
      fontSize: 11,
      fontWeight: "500",
    },
    navLabelActive: {
      color: colors.primary,
      fontWeight: "600",
    },
    // Cart Header Styles
    headerRight: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
    },
    cartButton: {
      width: 48,
      height: 48,
      borderRadius: radii.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
      position: "relative",
    },
    cartBadge: {
      position: "absolute",
      top: -8,
      right: -8,
      backgroundColor: colors.accent,
      borderRadius: radii.pill,
      width: 24,
      height: 24,
      alignItems: "center",
      justifyContent: "center",
    },
    cartBadgeText: {
      color: colors.background,
      fontWeight: "700",
      fontSize: 12,
    },
    // Cart Modal Styles
    cartModal: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 2000,
    },
    cartOverlay: {
      flex: 1,
      backgroundColor: "rgba(0, 0, 0, 0.7)",
    },
    cartContent: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: colors.surface,
      borderTopLeftRadius: radii.lg,
      borderTopRightRadius: radii.lg,
      maxHeight: "90%",
      minHeight: "50%",
      flexDirection: "column",
    },
    cartContentExpanded: {
      position: "absolute",
      top: 0,
      bottom: 0,
      maxHeight: "100%",
      minHeight: "100%",
      borderTopLeftRadius: 0,
      borderTopRightRadius: 0,
    },
    cartHandle: {
      alignItems: "center",
      paddingVertical: spacing.sm,
    },
    handleBar: {
      width: 40,
      height: 4,
      backgroundColor: colors.border,
      borderRadius: 2,
    },
    cartHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    cartHeaderActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
    },
    expandButton: {
      width: 40,
      height: 40,
      borderRadius: radii.md,
      backgroundColor: colors.card,
      alignItems: "center",
      justifyContent: "center",
    },
    cartTitle: {
      ...typography.headline,
      color: colors.textPrimary,
    },
    emptyCart: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      paddingVertical: spacing.xl * 2,
      gap: spacing.md,
    },
    emptyCartText: {
      ...typography.title,
      color: colors.textPrimary,
    },
    emptyCartSubtext: {
      color: colors.textSecondary,
      textAlign: "center",
      paddingHorizontal: spacing.lg,
    },
    cartItemsList: {
      flex: 1,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    cartItem: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    cartItemImage: {
      width: 50,
      height: 50,
      borderRadius: radii.md,
      marginRight: spacing.md,
    },
    cartItemInfo: {
      flex: 1,
    },
    cartItemTitle: {
      ...typography.body,
      color: colors.textPrimary,
    },
    cartItemPrice: {
      color: colors.accent,
      fontWeight: "600",
      marginTop: spacing.xs,
    },
    cartItemOption: {
      color: colors.textSecondary,
      fontSize: 12,
      marginTop: 2,
    },
    quantityControl: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      backgroundColor: colors.card,
      borderRadius: radii.md,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
    },
    quantityButton: {
      width: 28,
      height: 28,
      borderRadius: radii.sm,
      alignItems: "center",
      justifyContent: "center",
    },
    quantityText: {
      color: colors.textPrimary,
      fontWeight: "600",
      minWidth: 24,
      textAlign: "center",
    },
    cartSummary: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.lg,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    deliveryLocationRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radii.sm,
      marginBottom: spacing.md,
      gap: spacing.xs,
    },
    deliveryLocationLabel: {
      color: colors.textSecondary,
      fontSize: 13,
      marginLeft: spacing.xs,
    },
    deliveryLocationValue: {
      color: colors.accent,
      fontSize: 13,
      fontWeight: "700",
    },
    summaryRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: spacing.sm,
    },
    summaryLabel: {
      color: colors.textSecondary,
      fontSize: 14,
    },
    summaryValue: {
      color: colors.textPrimary,
      fontWeight: "600",
    },
    totalRow: {
      paddingTopMargin: spacing.md,
      paddingTop: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      marginBottomMargin: spacing.lg,
      marginBottom: spacing.lg,
    },
    totalLabel: {
      ...typography.title,
      color: colors.textPrimary,
    },
    totalValue: {
      ...typography.title,
      color: colors.accent,
    },
    checkoutButton: {
      backgroundColor: colors.primary,
      borderRadius: radii.md,
      paddingVertical: spacing.md,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: spacing.sm,
    },
    checkoutButtonDisabled: {
      backgroundColor: colors.primaryMuted,
      opacity: 0.6,
    },
    checkoutButtonText: {
      color: colors.card,
      fontWeight: "700",
      fontSize: 16,
    },
    clearCartButton: {
      backgroundColor: colors.card,
      borderRadius: radii.md,
      paddingVertical: spacing.md,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.border,
    },
    clearCartButtonText: {
      color: colors.textPrimary,
      fontWeight: "600",
      fontSize: 14,
    },
    // Schedule Delivery Styles
    scheduleSection: {
      marginTop: spacing.md,
      marginBottom: spacing.sm,
      gap: spacing.sm,
    },
    scheduleToggle: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: spacing.sm,
    },
    scheduleToggleLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    scheduleToggleText: {
      color: colors.textPrimary,
      fontSize: 15,
      fontWeight: "600",
    },
    datePickerButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    datePickerText: {
      flex: 1,
      color: colors.textPrimary,
      fontSize: 14,
      fontWeight: "600",
    },
    datePickerModal: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(0, 0, 0, 0.5)",
      justifyContent: "flex-end",
    },
    datePickerContent: {
      backgroundColor: colors.card,
      borderTopLeftRadius: radii.xl,
      borderTopRightRadius: radii.xl,
      maxHeight: "70%",
    },
    datePickerHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      padding: spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    datePickerTitle: {
      ...typography.title,
      color: colors.textPrimary,
    },
    timeSlotsList: {
      maxHeight: 400,
    },
    timeSlot: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    timeSlotText: {
      color: colors.textPrimary,
      fontSize: 15,
      fontWeight: "500",
    },
    // Quick Bites Styles
    quickGrid: {
      flexDirection: "row",
      gap: spacing.md,
    },
    quickColumn: {
      flex: 1,
      gap: spacing.md,
    },
    quickCard: {
      backgroundColor: colors.card,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    quickImageContainer: {
      position: "relative",
      width: "100%",
      height: 120,
    },
    quickImage: {
      width: "100%",
      height: "100%",
    },
    quickClosedOverlay: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(0, 0, 0, 0.5)",
      justifyContent: "center",
      alignItems: "center",
    },
    quickClosedBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs / 2,
      backgroundColor: colors.error,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radii.md,
    },
    quickClosedText: {
      color: colors.card,
      fontSize: 13,
      fontWeight: "700",
      textTransform: "uppercase",
    },
    quickBody: {
      padding: spacing.md,
      gap: spacing.xs,
    },
    quickTitle: {
      ...typography.body,
      color: colors.textPrimary,
      fontWeight: "600",
    },
    quickMeta: {
      color: colors.textSecondary,
      fontSize: 13,
    },
    quickMetaMuted: {
      color: colors.textMuted,
      fontSize: 12,
    },
    quickFooter: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginTop: spacing.sm,
    },
    quickPrice: {
      ...typography.title,
      color: colors.textPrimary,
      fontSize: 16,
    },
    quickAddButton: {
      width: 32,
      height: 32,
      borderRadius: radii.sm,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    // Modal Styles
    modalOverlay: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(0, 0, 0, 0.7)",
      justifyContent: "flex-end",
      zIndex: 9000,
    },
    modalContent: {
      backgroundColor: colors.background,
      borderTopLeftRadius: radii.xl,
      borderTopRightRadius: radii.xl,
      maxHeight: "80%",
      paddingBottom: spacing.xl,
    },
    modalHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      padding: spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    modalTitle: {
      ...typography.headline,
      color: colors.textPrimary,
      fontSize: 20,
    },
    modalBody: {
      maxHeight: 400,
    },
    modalButton: {
      backgroundColor: colors.primary,
      borderRadius: radii.md,
      paddingVertical: spacing.md,
      alignItems: "center",
      justifyContent: "center",
      marginHorizontal: spacing.lg,
      marginTop: spacing.lg,
    },
    modalButtonText: {
      color: colors.card,
      fontWeight: "700",
      fontSize: 16,
    },
    optionPickerMealName: {
      color: colors.textPrimary,
      fontSize: 18,
      fontWeight: "700",
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
    },
    optionPickerOverlay: {
      flex: 1,
      backgroundColor: "rgba(0, 0, 0, 0.6)",
      justifyContent: "flex-end",
    },
    optionPickerSheet: {
      backgroundColor: colors.card,
      borderTopLeftRadius: radii.lg,
      borderTopRightRadius: radii.lg,
      paddingTop: spacing.lg,
      paddingBottom: spacing.xl,
      maxHeight: "82%",
    },
    optionPickerHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: spacing.lg,
      marginBottom: spacing.sm,
    },
    optionPickerTitle: {
      ...typography.title,
      color: colors.textPrimary,
    },
    optionPickerBody: {
      maxHeight: 360,
    },
    optionPickerSectionTitle: {
      color: colors.textPrimary,
      fontSize: 14,
      fontWeight: "700",
      paddingHorizontal: spacing.lg,
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
    },
    optionPickerChipWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
    },
    optionPickerChip: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: radii.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    optionPickerChipActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primary + "22",
    },
    optionPickerChipText: {
      color: colors.textSecondary,
      fontSize: 13,
      fontWeight: "600",
    },
    optionPickerChipTextActive: {
      color: colors.primary,
    },
    optionPickerHintText: {
      color: colors.textMuted,
      fontSize: 13,
      paddingHorizontal: spacing.lg,
    },
    optionPickerActions: {
      flexDirection: "row",
      gap: spacing.md,
      marginTop: spacing.lg,
      paddingHorizontal: spacing.lg,
    },
    optionPickerButton: {
      flex: 1,
      borderRadius: radii.md,
      paddingVertical: spacing.md,
      alignItems: "center",
      justifyContent: "center",
    },
    optionPickerCancelButton: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    optionPickerCancelText: {
      color: colors.textPrimary,
      fontWeight: "600",
      fontSize: 15,
    },
    optionPickerConfirmButton: {
      backgroundColor: colors.primary,
    },
    optionPickerConfirmText: {
      color: colors.card,
      fontWeight: "700",
      fontSize: 15,
    },
    paymentChoiceOverlay: {
      flex: 1,
      backgroundColor: "rgba(0, 0, 0, 0.55)",
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: spacing.lg,
    },
    paymentChoiceCard: {
      width: "100%",
      maxWidth: 420,
      backgroundColor: colors.card,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      gap: spacing.md,
    },
    paymentChoiceTitle: {
      ...typography.title,
      color: colors.textPrimary,
      fontSize: 20,
      textAlign: "center",
    },
    paymentChoiceDescription: {
      color: colors.textSecondary,
      textAlign: "center",
      lineHeight: 20,
    },
    paymentChoiceActions: {
      gap: spacing.sm,
    },
    paymentChoiceButton: {
      borderRadius: radii.md,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: spacing.md,
    },
    paymentChoiceButtonPrimary: {
      backgroundColor: colors.primary,
    },
    paymentChoiceButtonSecondary: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    paymentChoiceButtonPrimaryText: {
      color: colors.card,
      fontWeight: "700",
      fontSize: 15,
    },
    paymentChoiceButtonSecondaryText: {
      color: colors.textPrimary,
      fontWeight: "700",
      fontSize: 15,
    },
    paymentChoiceCancelButton: {
      marginTop: spacing.xs,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: spacing.sm,
    },
    paymentChoiceCancelText: {
      color: colors.textSecondary,
      fontWeight: "600",
    },
    filterOption: {
      flexDirection: "row",
      alignItems: "center",
      padding: spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap: spacing.md,
    },
    filterOptionActive: {
      backgroundColor: colors.surface,
    },
    filterOptionText: {
      flex: 1,
      color: colors.textPrimary,
      fontSize: 16,
      fontWeight: "500",
    },
    filterOptionTextActive: {
      color: colors.accent,
      fontWeight: "700",
    },
    filterIconWrapper: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
    },
    locationInfo: {
      flex: 1,
    },
    locationDistance: {
      color: colors.textMuted,
      fontSize: 12,
      marginTop: spacing.xs,
    },
    subLocationsSection: {
      marginTop: spacing.lg,
      paddingTop: spacing.lg,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    subLocationsTitle: {
      ...typography.body,
      color: colors.textSecondary,
      fontSize: 14,
      fontWeight: "600",
      marginBottom: spacing.md,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    subLocationOption: {
      marginLeft: spacing.lg,
      paddingLeft: spacing.lg,
      borderLeftWidth: 2,
      borderLeftColor: colors.border,
    },
    subLocationText: {
      fontSize: 14,
    },
  });

const AppWithAuth = () => (
  <AuthProvider>
    <ThemeProvider>
      <NotificationProvider>
        <VersionGate>
          <App />
        </VersionGate>
      </NotificationProvider>
    </ThemeProvider>
  </AuthProvider>
);

function VersionGate({ children }) {
  const [checking, setChecking] = React.useState(true);
  const [requiredVersion, setRequiredVersion] = React.useState(null);
  const [storeUrl, setStoreUrl] = React.useState("");
  const [releaseNote, setReleaseNote] = React.useState("");
  const currentVersion = React.useMemo(() => getCurrentAppVersion(), []);

  React.useEffect(() => {
    let mounted = true;

    const checkVersion = async () => {
      try {
        const settings = await fetchAppSettings();
        const minVersion =
          Platform.OS === "ios"
            ? settings?.versionControl?.chawp?.iosMinVersion
            : settings?.versionControl?.chawp?.androidMinVersion;
        const configuredStoreUrl =
          Platform.OS === "ios"
            ? settings?.versionControl?.chawp?.iosStoreUrl
            : settings?.versionControl?.chawp?.androidStoreUrl;
        const configuredReleaseNote =
          settings?.versionControl?.chawp?.releaseNote || "";

        if (
          mounted &&
          minVersion &&
          compareVersions(currentVersion, minVersion) < 0
        ) {
          setRequiredVersion(minVersion);
          setStoreUrl(String(configuredStoreUrl || "").trim());
          setReleaseNote(String(configuredReleaseNote || "").trim());
        }
      } catch (error) {
        console.warn("Version gate check skipped:", error?.message || error);
      } finally {
        if (mounted) {
          setChecking(false);
        }
      }
    };

    checkVersion();

    return () => {
      mounted = false;
    };
  }, [currentVersion]);

  const handleOpenStore = React.useCallback(async () => {
    try {
      if (storeUrl) {
        await Linking.openURL(storeUrl);
        return;
      }

      if (Platform.OS === "android") {
        const packageName = Constants.expoConfig?.android?.package;
        if (!packageName) return;

        const marketUrl = `market://details?id=${packageName}`;
        const webUrl = `https://play.google.com/store/apps/details?id=${packageName}`;

        const canOpenMarket = await Linking.canOpenURL(marketUrl);
        await Linking.openURL(canOpenMarket ? marketUrl : webUrl);
        return;
      }

      await Linking.openURL("itms-apps://apps.apple.com");
    } catch (error) {
      console.warn("Unable to open store:", error?.message || error);
    }
  }, [storeUrl]);

  if (checking) {
    return <ChawpLoading />;
  }

  if (!requiredVersion) {
    return children;
  }

  return (
    <SafeAreaView style={versionGateStyles.container}>
      <Text style={versionGateStyles.title}>Update Required</Text>
      <Text style={versionGateStyles.message}>
        A newer version of Chawp is required to continue.
      </Text>
      <Text style={versionGateStyles.meta}>
        Current: {currentVersion} | Required: {requiredVersion}
      </Text>
      {!!releaseNote && (
        <Text style={versionGateStyles.releaseNote}>{releaseNote}</Text>
      )}
      <TouchableOpacity
        style={versionGateStyles.button}
        onPress={handleOpenStore}
      >
        <Text style={versionGateStyles.buttonText}>Open Store</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const versionGateStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  title: {
    color: "#2EA7FF",
    fontSize: 28,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  message: {
    color: "#FFFFFF",
    fontSize: 16,
    textAlign: "center",
    lineHeight: 22,
  },
  meta: {
    color: "#9AA3B2",
    fontSize: 13,
    textAlign: "center",
  },
  releaseNote: {
    color: "#D8DEE8",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  button: {
    marginTop: spacing.sm,
    backgroundColor: "#2EA7FF",
    borderRadius: radii.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  buttonText: {
    color: "#000000",
    fontWeight: "700",
    fontSize: 15,
  },
});

export default AppWithAuth;
