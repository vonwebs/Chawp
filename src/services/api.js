/**
 * API Service Layer
 * Centralized API calls using Supabase backend.
 */

import { supabase } from "../config/supabase";

// ==================== Authentication ====================

/**
 * Sign up a new user
 * @param {string} email - User email
 * @param {string} password - User password
 * @param {Object} metadata - Additional user metadata
 */
export async function signUp(email, password, metadata = {}) {
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: metadata,
      },
    });

    if (error) throw error;

    // Don't try to create profile immediately after signup
    // Let it happen naturally when the user signs in
    return data;
  } catch (error) {
    console.error("Error signing up:", error);
    throw error;
  }
}

/**
 * Sign in a user
 * @param {string} email - User email
 * @param {string} password - User password
 */
export async function signIn(email, password) {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("Error signing in:", error);
    throw error;
  }
}

/**
 * Sign out the current user
 */
export async function signOut() {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  } catch (error) {
    console.error("Error signing out:", error);
    throw error;
  }
}

/**
 * Get current user
 */
export async function getCurrentUser() {
  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error) throw error;
    return user;
  } catch (error) {
    console.error("Error getting current user:", error);
    throw error;
  }
}

/**
 * Get user profile - creates one if it doesn't exist
 */
export async function getUserProfile() {
  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new Error("No authenticated user");
    }

    // First try to get existing profile
    const { data, error } = await supabase
      .from("chawp_user_profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (error && error.code === "PGRST116") {
      // Profile doesn't exist, create it
      console.log("Profile not found, creating new profile...");
      const { data: newProfile, error: createError } = await supabase
        .from("chawp_user_profiles")
        .insert({
          id: user.id,
          email: user.email || null,
          role: "user",
          full_name:
            user.user_metadata?.full_name ||
            (user.email ? user.email.split("@")[0] : null) ||
            "User",
          avatar_url: user.user_metadata?.avatar_url || null,
        })
        .select()
        .single();

      if (createError) {
        console.error("Failed to create profile:", createError);
        // Return a basic profile object instead of throwing
        return {
          id: user.id,
          full_name:
            user.user_metadata?.full_name ||
            (user.email ? user.email.split("@")[0] : null) ||
            "User",
          avatar_url: user.user_metadata?.avatar_url || null,
          username: null,
          phone: null,
        };
      }
      return newProfile;
    }

    if (error) {
      console.error("Error fetching profile:", error);
      throw error;
    }

    // Update email if it's missing in the profile
    if (data && !data.email && user.email) {
      console.log("Updating profile with email...");
      const { error: updateError } = await supabase
        .from("chawp_user_profiles")
        .update({ email: user.email })
        .eq("id", user.id);

      if (!updateError) {
        data.email = user.email;
      }
    }

    // Keep role consistent for customer audience targeting.
    if (data && !data.role) {
      const { error: roleUpdateError } = await supabase
        .from("chawp_user_profiles")
        .update({ role: "user" })
        .eq("id", user.id);

      if (!roleUpdateError) {
        data.role = "user";
      }
    }

    return data;
  } catch (error) {
    console.error("Error fetching/creating user profile:", error);
    // Return a fallback profile instead of throwing
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        return {
          id: user.id,
          email: user.email || null,
          full_name:
            user.user_metadata?.full_name ||
            (user.email ? user.email.split("@")[0] : null) ||
            "User",
          avatar_url: user.user_metadata?.avatar_url || null,
          username: null,
          phone: null,
        };
      }
    } catch (fallbackError) {
      console.error("Fallback profile creation failed:", fallbackError);
    }
    throw error;
  }
}

/**
 * Update user profile
 * @param {Object} updates - Profile updates
 */
export async function updateUserProfile(updates) {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("No authenticated user");

    const { data, error } = await supabase
      .from("chawp_user_profiles")
      .update(updates)
      .eq("id", user.id)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("Error updating user profile:", error);
    throw error;
  }
}

/**
 * Fetch vendors with optional status filter
 * @param {string} status - Filter by status: 'active', 'inactive', 'closed', or null for all
 */
export async function fetchVendors(status = "active") {
  try {
    let query = supabase
      .from("chawp_vendors")
      .select("*")
      .is("deleted_at", null)
      .order("rating", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("Error fetching vendors:", error);
    throw error;
  }
}

/**
 * Fetch meals with optional filters
 * @param {Object} filters - Optional filters: { vendorId, category, status }
 */
export async function fetchMeals(filters = {}) {
  try {
    let query = supabase
      .from("chawp_meals")
      .select(
        `
        *,
        vendor:chawp_vendors (
          id,
          name,
          rating,
          delivery_time,
          distance,
          tags,
          status,
          operational_status,
          deleted_at
        )
      `,
      )
      .order("created_at", { ascending: false });

    if (filters.vendorId) {
      query = query.eq("vendor_id", filters.vendorId);
    }

    if (filters.category) {
      query = query.eq("category", filters.category);
    }

    if (filters.status) {
      query = query.eq("status", filters.status);
    } else {
      // Default to only showing available meals
      query = query.eq("status", "available");
    }

    const { data, error } = await query;

    if (error) throw error;

    const filteredMeals = (data || []).filter(
      (meal) =>
        meal.vendor &&
        !meal.vendor.deleted_at &&
        meal.vendor.status === "active",
    );

    // Enrich meals with vendor hours status
    if (filteredMeals.length > 0) {
      const currentDay = new Date().getDay(); // 0 = Sunday, 6 = Saturday
      const currentTime = new Date().toTimeString().slice(0, 5); // HH:MM

      // Get unique vendor IDs
      const vendorIds = [
        ...new Set(filteredMeals.map((meal) => meal.vendor_id)),
      ];

      // Fetch vendor hours for current day for all vendors
      const { data: vendorHours, error: hoursError } = await supabase
        .from("chawp_vendor_hours")
        .select("vendor_id, is_closed, open_time, close_time")
        .eq("day_of_week", currentDay)
        .in("vendor_id", vendorIds);

      if (!hoursError && vendorHours) {
        // Create maps for vendor schedule status
        const vendorClosedMap = {};
        const vendorOpenNowMap = {};
        vendorHours.forEach((hour) => {
          const isClosedToday = hour.is_closed === true;
          vendorClosedMap[hour.vendor_id] = isClosedToday;

          if (isClosedToday || !hour.open_time || !hour.close_time) {
            vendorOpenNowMap[hour.vendor_id] = false;
            return;
          }

          const openTime = String(hour.open_time).slice(0, 5);
          const closeTime = String(hour.close_time).slice(0, 5);

          // Supports both normal and overnight schedules.
          const isOvernight = closeTime < openTime;
          const isOpenNow = isOvernight
            ? currentTime >= openTime || currentTime <= closeTime
            : currentTime >= openTime && currentTime <= closeTime;

          vendorOpenNowMap[hour.vendor_id] = isOpenNow;
        });

        // Add real-time open/closed status to each meal's vendor
        filteredMeals.forEach((meal) => {
          if (meal.vendor && meal.vendor_id in vendorClosedMap) {
            const isClosedToday = vendorClosedMap[meal.vendor_id];
            const isOpenNow = vendorOpenNowMap[meal.vendor_id] === true;

            meal.vendor.is_closed_today = isClosedToday;
            meal.vendor.is_open_now = isOpenNow;
            meal.vendor.currently_open = isOpenNow;
            meal.vendor.is_open = isOpenNow;

            if (!isOpenNow) {
              meal.vendor.operational_status = "closed";
            }
          } else {
            // If no hours found for today, assume closed
            meal.vendor.is_closed_today = true;
            meal.vendor.is_open_now = false;
            meal.vendor.currently_open = false;
            meal.vendor.is_open = false;
            meal.vendor.operational_status = "closed";
          }
        });
      } else {
        // If schedule lookup fails, keep vendor flags conservative.
        filteredMeals.forEach((meal) => {
          if (!meal.vendor) return;
          const isClosed = meal.vendor.operational_status === "closed";
          meal.vendor.is_closed_today = isClosed;
          meal.vendor.is_open_now = !isClosed;
          meal.vendor.currently_open = !isClosed;
          meal.vendor.is_open = !isClosed;
        });
      }
    }

    return filteredMeals;
  } catch (error) {
    console.error("Error fetching meals:", error);
    throw error;
  }
}

/**
 * Fetch a single vendor by ID
 */
export async function fetchVendorById(vendorId) {
  try {
    const { data, error } = await supabase
      .from("chawp_vendors")
      .select("*")
      .is("deleted_at", null)
      .eq("id", vendorId)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("Error fetching vendor:", error);
    throw error;
  }
}

/**
 * Fetch a single meal by ID
 */
export async function fetchMealById(mealId) {
  try {
    const { data, error } = await supabase
      .from("chawp_meals")
      .select(
        `
        *,
        vendor:chawp_vendors (*)
      `,
      )
      .eq("id", mealId)
      .single();

    if (error) throw error;

    if (!data?.vendor || data.vendor.deleted_at) {
      throw new Error("Meal is no longer available");
    }

    return data;
  } catch (error) {
    console.error("Error fetching meal:", error);
    throw error;
  }
}

// ==================== Categories ====================

// Legacy functions maintained for compatibility
// These now fetch from Supabase

export async function fetchFeaturedRestaurants() {
  // Fetch active vendors with high ratings
  return fetchVendors("active");
}

export async function fetchQuickBites() {
  // Fetch available meals
  return fetchMeals({ status: "available" });
}

// ==================== Discovery ====================

export async function fetchDiscoveryHighlights() {
  // TODO: Replace with actual API call
  // return apiFetch("/discovery/highlights");

  return Promise.resolve([
    {
      id: "chef-series",
      title: "Chef's series",
      description: "Signature menus from rotating guest chefs",
      image:
        "https://images.unsplash.com/photo-1447078806655-40579c2520d6?auto=format&fit=crop&w=900&q=80",
    },
  ]);
}

export async function fetchTrendingSearches() {
  // TODO: Replace with actual API call
  // return apiFetch("/discovery/trending");

  return Promise.resolve([
    { id: "bao", label: "Charcoal bao", icon: "rice" },
    { id: "ramen", label: "Spicy miso ramen", icon: "noodles" },
  ]);
}

export async function fetchEditorPicks() {
  // TODO: Replace with actual API call
  // return apiFetch("/discovery/editor-picks");

  return Promise.resolve([
    {
      id: "glow-bowl",
      name: "Glow Bowl by Lumi",
      tags: ["Bowls", "Fusion"],
      distance: "1.2 km",
      rating: 4.9,
      priceLevel: "$$",
      image:
        "https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=900&q=80",
    },
  ]);
}

// ==================== Profile ====================

export async function fetchUserProfile() {
  // TODO: Replace with actual API call
  // return apiFetch("/user/profile");

  return Promise.resolve({
    name: "Nova Quinn",
    location: "1439 Silverpine Ave.",
    avatar:
      "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=400&q=80",
  });
}

export async function fetchUserStats() {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("No authenticated user");

    console.log("Fetching stats for user ID:", user.id);

    // Get order count - only for this specific user
    const { count: orderCount, error: orderError } = await supabase
      .from("chawp_orders")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);

    if (orderError) {
      console.error("Error fetching order count:", orderError);
    } else {
      console.log("User order count:", orderCount);
    }

    // Get review count - only for this specific user
    const { count: reviewCount, error: reviewError } = await supabase
      .from("chawp_reviews")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);

    if (reviewError) {
      console.error("Error fetching review count:", reviewError);
    } else {
      console.log("User review count:", reviewCount);
    }

    // Get favorites count (saved vendors/meals) - only for this specific user
    const { count: favoritesCount, error: favoritesError } = await supabase
      .from("chawp_user_favorites")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);

    if (favoritesError) {
      console.error("Error fetching favorites count:", favoritesError);
    }

    const stats = {
      orderCount: orderCount || 0,
      reviewCount: reviewCount || 0,
      favoritesCount: favoritesCount || 0,
      rewardTier: "Gold",
    };

    console.log("Final user stats:", stats);
    return stats;
  } catch (error) {
    console.error("Error fetching user stats:", error);
    return {
      orderCount: 0,
      reviewCount: 0,
      favoritesCount: 0,
      rewardTier: "Bronze",
    };
  }
}

export async function fetchRewardBadges() {
  // TODO: Replace with actual API call
  // return apiFetch("/user/rewards");

  return Promise.resolve([
    {
      id: "glow-gold",
      label: "Glow Gold",
      description: "Unlocked for 12 consecutive late-night orders",
      icon: "crown",
    },
  ]);
}

export async function fetchPaymentMethods() {
  // TODO: Replace with actual API call
  // return apiFetch("/user/payment-methods");

  return Promise.resolve([
    { id: "visa", label: "Visa ending · 2481", icon: "card" },
    { id: "apple-pay", label: "Apple Pay", icon: "logo-apple" },
  ]);
}

// ==================== Cart ====================

function normalizeCartSize(size) {
  if (typeof size !== "string") return null;

  const normalized = size.trim().toLowerCase();
  return normalized || null;
}

function normalizeCartSpecifications(specifications = []) {
  if (!Array.isArray(specifications)) return [];

  return [
    ...new Set(
      specifications.map((spec) => String(spec || "").trim()).filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

function buildCartOptionsKey(size, specifications = []) {
  const normalizedSize = normalizeCartSize(size);
  const normalizedSpecifications = normalizeCartSpecifications(specifications);
  return `${normalizedSize || "none"}::${normalizedSpecifications.join("|")}`;
}

function isNoSizeOptionsKey(optionsKey) {
  return typeof optionsKey === "string" && optionsKey.startsWith("none::");
}

function formatCartSize(size) {
  return (normalizeCartSize(size) || "")
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizePriceAdjustments(priceMap = {}, normalizeKey = (key) => key) {
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
}

function getMealPricingDetails(
  meal = {},
  selectedSize = null,
  selectedSpecifications = [],
) {
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
    unitPrice,
    totalAdjustment: Number(
      (sizeAdjustment + specificationAdjustment).toFixed(2),
    ),
  };
}

function buildOrderItemInstructions(item) {
  const selectedSize = isNoSizeOptionsKey(item?.options_key)
    ? null
    : item?.selected_size
      ? formatCartSize(item.selected_size)
      : null;
  const selectedSpecifications = normalizeCartSpecifications(
    item?.selected_specifications || [],
  );
  const customerNote = String(item?.special_instructions || "").trim();

  const lines = [];
  if (selectedSize) {
    lines.push(`Size: ${selectedSize}`);
  }
  if (selectedSpecifications.length > 0) {
    lines.push(`Specifications: ${selectedSpecifications.join(", ")}`);
  }
  if (customerNote) {
    lines.push(`Note: ${customerNote}`);
  }

  return lines.join("\n");
}

/**
 * Get user's cart items
 */
export async function getCartItems() {
  try {
    const userProfile = await getUserProfile();
    if (!userProfile) throw new Error("Authentication required");

    const { data, error } = await supabase
      .from("chawp_cart_items")
      .select(
        `
        *,
        meal:chawp_meals (
          id,
          title,
          description,
          image,
          images,
          price,
          size_prices,
          specification_prices,
          category,
          size,
          sizes,
          specifications,
          vendor:chawp_vendors (
            id,
            name,
            delivery_time,
            distance
          )
        )
      `,
      )
      .eq("user_id", userProfile.id)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("Error fetching cart items:", error);
    throw error;
  }
}

/**
 * Fetch hero cards/banners
 */
export async function fetchHeroCards() {
  try {
    const { data, error } = await supabase
      .from("chawp_hero_cards")
      .select("*")
      .eq("is_active", true)
      .order("order_index", { ascending: true });

    if (error) throw error;

    return data || [];
  } catch (error) {
    console.error("Error fetching hero cards:", error);
    throw error;
  }
}

/**
 * Fetch categories
 */
export async function fetchCategories() {
  try {
    const { data, error } = await supabase
      .from("chawp_meals")
      .select("category")
      .not("category", "is", null);

    if (error) throw error;

    // Get unique categories and sort them
    const categories = [...new Set(data.map((item) => item.category))].sort();

    // Add icons and labels for common categories
    const categoryMap = {
      Pizza: { icon: "pizza", label: "Pizza" },
      Burger: { icon: "hamburger", label: "Burgers" },
      Italian: { icon: "food-variant", label: "Italian" },
      Chinese: { icon: "noodles", label: "Chinese" },
      Japanese: { icon: "rice", label: "Japanese" },
      Mexican: { icon: "taco", label: "Mexican" },
      Indian: { icon: "food", label: "Indian" },
      American: { icon: "hamburger", label: "American" },
      Thai: { icon: "food", label: "Thai" },
      Mediterranean: { icon: "food-variant", label: "Mediterranean" },
      "Fast Food": { icon: "hamburger", label: "Fast Food" },
      Healthy: { icon: "leaf", label: "Healthy" },
      Dessert: { icon: "cake", label: "Dessert" },
      Beverage: { icon: "cup", label: "Beverages" },
    };

    return categories.map((category) => ({
      id: category.toLowerCase().replace(/\s+/g, "-"),
      label: category,
      icon: categoryMap[category]?.icon || "food",
    }));
  } catch (error) {
    console.error("Error fetching categories:", error);
    throw error;
  }
}

/**
 * Create order from cart items
 * @param {Object} orderData - Order data including delivery address, payment method, etc.
 */
export async function createOrder(orderData) {
  try {
    const userProfile = await getUserProfile();
    if (!userProfile) throw new Error("Authentication required");

    // Get cart items
    const cartItems = await getCartItems();
    if (cartItems.length === 0) throw new Error("Cart is empty");

    // Calculate total and group by vendor
    const vendorGroups = {};
    let totalAmount = 0;

    cartItems.forEach((item) => {
      const vendorId = item.meal.vendor.id;
      if (!vendorGroups[vendorId]) {
        vendorGroups[vendorId] = {
          vendorId,
          items: [],
          subtotal: 0,
        };
      }

      const pricing = getMealPricingDetails(
        item.meal,
        isNoSizeOptionsKey(item?.options_key) ? null : item?.selected_size,
        item?.selected_specifications || [],
      );
      const itemTotal = item.quantity * pricing.unitPrice;
      vendorGroups[vendorId].items.push({
        meal_id: item.meal_id,
        quantity: item.quantity,
        unit_price: pricing.unitPrice,
        selected_size: isNoSizeOptionsKey(item?.options_key)
          ? null
          : normalizeCartSize(item?.selected_size),
        selected_specifications: normalizeCartSpecifications(
          item?.selected_specifications || [],
        ),
        meal_image:
          item?.meal?.image ||
          (Array.isArray(item?.meal?.images) ? item.meal.images[0] : null) ||
          null,
        special_instructions: buildOrderItemInstructions(item),
      });
      vendorGroups[vendorId].subtotal += itemTotal;
      totalAmount += itemTotal;
    });

    // Create orders for each vendor
    const orderPromises = Object.values(vendorGroups).map(async (group) => {
      // Prepare order data
      const orderInsertData = {
        user_id: userProfile.id,
        vendor_id: group.vendorId,
        total_amount: group.subtotal,
        delivery_address: orderData.deliveryAddress,
        delivery_instructions: orderData.deliveryInstructions,
        payment_method: orderData.paymentMethod,
      };

      // Add scheduled_for if provided
      if (orderData.scheduledFor) {
        orderInsertData.scheduled_for = orderData.scheduledFor;
        orderInsertData.status = "scheduled";
      }

      // Create order
      const { data: order, error: orderError } = await supabase
        .from("chawp_orders")
        .insert(orderInsertData)
        .select()
        .single();

      if (orderError) throw orderError;

      // Create order items
      const orderItems = group.items.map((item) => ({
        order_id: order.id,
        ...item,
      }));

      const { error: itemsError } = await supabase
        .from("chawp_order_items")
        .insert(orderItems);

      if (itemsError) throw itemsError;

      return order;
    });

    const orders = await Promise.all(orderPromises);

    // Clear cart after successful order creation
    await clearCart();

    return {
      success: true,
      orders,
      totalAmount,
    };
  } catch (error) {
    console.error("Error creating order:", error);
    throw error;
  }
}

/**
 * Get user's orders
 * @param {Object} filters - Optional filters
 */
export async function getUserOrders(filters = {}) {
  try {
    const userProfile = await getUserProfile();
    if (!userProfile) throw new Error("Authentication required");

    let query = supabase
      .from("chawp_orders")
      .select(
        `
        *,
        vendor:chawp_vendors (
          id,
          name,
          image
        ),
        order_items:chawp_order_items (
          *,
          meal:chawp_meals (
            id,
            title,
            image
          )
        )
      `,
      )
      .eq("user_id", userProfile.id)
      .order("created_at", { ascending: false });

    if (filters.status) {
      query = query.eq("status", filters.status);
    }

    if (filters.limit) {
      query = query.limit(filters.limit);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("Error fetching user orders:", error);
    throw error;
  }
}

// ==================== Ratings & Comments ====================

/**
 * Fetch vendor operating hours
 * @param {string} vendorId - Vendor ID
 */
export async function fetchVendorHours(vendorId) {
  try {
    const { data, error } = await supabase
      .from("chawp_vendor_hours")
      .select("*")
      .eq("vendor_id", vendorId)
      .order("day_of_week");

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("Error fetching vendor hours:", error);
    throw error;
  }
}

/**
 * Check if vendor is currently open
 * @param {string} vendorId - Vendor ID
 */
export async function checkVendorStatus(vendorId) {
  try {
    // Get vendor operational status
    const { data: vendor, error: vendorError } = await supabase
      .from("chawp_vendors")
      .select("operational_status")
      .eq("id", vendorId)
      .single();

    if (vendorError) throw vendorError;

    // If manually set to closed, return closed
    if (vendor.operational_status === "closed") {
      return { isOpen: false, status: "closed" };
    }

    // Check current time against operating hours
    const now = new Date();
    const currentDay = now.getDay(); // 0 = Sunday, 6 = Saturday
    const currentTime = now.toTimeString().slice(0, 5); // HH:MM format

    const { data: hours, error: hoursError } = await supabase
      .from("chawp_vendor_hours")
      .select("*")
      .eq("vendor_id", vendorId)
      .eq("day_of_week", currentDay)
      .eq("is_closed", false)
      .single();

    if (hoursError || !hours) {
      return { isOpen: false, status: "closed" };
    }

    const isOpen =
      currentTime >= hours.open_time && currentTime <= hours.close_time;
    return {
      isOpen,
      status: isOpen ? "open" : "closed",
      openTime: hours.open_time,
      closeTime: hours.close_time,
    };
  } catch (error) {
    console.error("Error checking vendor status:", error);
    return { isOpen: false, status: "unknown" };
  }
}

/**
 * Fetch ratings for a target (vendor or meal)
 * @param {string} targetType - 'vendor' or 'meal'
 * @param {string} targetId - Target ID
 */
export async function fetchRatings(targetType, targetId) {
  try {
    let query = supabase
      .from("chawp_reviews")
      .select("*")
      .order("created_at", { ascending: false });

    if (targetType === "vendor") {
      query = query.eq("vendor_id", targetId);
    } else if (targetType === "meal") {
      query = query.eq("meal_id", targetId);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("Error fetching ratings:", error);
    throw error;
  }
}

/**
 * Submit a rating
 * @param {string} targetType - 'vendor' or 'meal'
 * @param {string} targetId - Target ID
 * @param {number} rating - Rating value (1-5)
 */
export async function submitRating(targetType, targetId, rating) {
  try {
    const userProfile = await getUserProfile();
    if (!userProfile) throw new Error("Authentication required");

    const reviewData = {
      user_id: userProfile.id,
      rating: rating,
    };

    if (targetType === "vendor") {
      reviewData.vendor_id = targetId;
    } else if (targetType === "meal") {
      reviewData.meal_id = targetId;
    }

    const { data, error } = await supabase
      .from("chawp_reviews")
      .upsert(reviewData, {
        onConflict:
          targetType === "vendor" ? "user_id,vendor_id" : "user_id,meal_id",
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("Error submitting rating:", error);
    throw error;
  }
}

/**
 * Fetch comments for a target (vendor or meal)
 * @param {string} targetType - 'vendor' or 'meal'
 * @param {string} targetId - Target ID
 */
export async function fetchComments(targetType, targetId) {
  try {
    let query = supabase
      .from("chawp_reviews")
      .select(
        `
        *,
        user:chawp_user_profiles(full_name, username, avatar_url)
      `,
      )
      .not("comment", "is", null)
      .order("created_at", { ascending: false });

    if (targetType === "vendor") {
      query = query.eq("vendor_id", targetId);
    } else if (targetType === "meal") {
      query = query.eq("meal_id", targetId);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("Error fetching comments:", error);
    throw error;
  }
}

/**
 * Submit a comment
 * @param {string} targetType - 'vendor' or 'meal'
 * @param {string} targetId - Target ID
 * @param {string} comment - Comment text
 * @param {number} rating - Optional rating (1-5)
 */
export async function submitComment(
  targetType,
  targetId,
  comment,
  rating = null,
) {
  try {
    const userProfile = await getUserProfile();
    if (!userProfile) throw new Error("Authentication required");

    const reviewData = {
      user_id: userProfile.id,
      comment: comment,
    };

    if (rating) {
      reviewData.rating = rating;
    }

    if (targetType === "vendor") {
      reviewData.vendor_id = targetId;
    } else if (targetType === "meal") {
      reviewData.meal_id = targetId;
    }

    const { data, error } = await supabase
      .from("chawp_reviews")
      .upsert(reviewData, {
        onConflict:
          targetType === "vendor" ? "user_id,vendor_id" : "user_id,meal_id",
      })
      .select()
      .single();

    if (error) throw error;

    // Update vendor rating if this is a vendor review with a rating
    if (targetType === "vendor" && rating) {
      await updateVendorRating(targetId);
    }

    return data;
  } catch (error) {
    console.error("Error submitting comment:", error);
    throw error;
  }
}

/**
 * Update vendor's aggregate rating based on all reviews
 * @param {string} vendorId - Vendor ID
 */
async function updateVendorRating(vendorId) {
  try {
    // Get all ratings for this vendor
    const { data: reviews, error: fetchError } = await supabase
      .from("chawp_reviews")
      .select("rating")
      .eq("vendor_id", vendorId)
      .not("rating", "is", null);

    if (fetchError) throw fetchError;

    // Calculate average rating
    let averageRating = 0;
    if (reviews && reviews.length > 0) {
      const sum = reviews.reduce((acc, review) => acc + review.rating, 0);
      averageRating = Math.round((sum / reviews.length) * 10) / 10; // Round to 1 decimal
    }

    // Update the vendor's rating field
    const { error: updateError } = await supabase
      .from("chawp_vendors")
      .update({ rating: averageRating })
      .eq("id", vendorId);

    if (updateError) throw updateError;

    console.log(`Updated vendor ${vendorId} rating to ${averageRating}`);
  } catch (error) {
    console.error("Error updating vendor rating:", error);
    // Don't throw - we don't want rating update failure to fail the review submission
  }
}

/**
 * Get average rating for a target
 * @param {string} targetType - 'vendor' or 'meal'
 * @param {string} targetId - Target ID
 */
export async function getAverageRating(targetType, targetId) {
  try {
    let query = supabase.from("chawp_reviews").select("rating");

    if (targetType === "vendor") {
      query = query.eq("vendor_id", targetId);
    } else if (targetType === "meal") {
      query = query.eq("meal_id", targetId);
    }

    const { data, error } = await query;

    if (error) throw error;

    if (!data || data.length === 0) {
      return { average: 0, count: 0 };
    }

    const sum = data.reduce((acc, item) => acc + item.rating, 0);
    const average = sum / data.length;

    return {
      average: Math.round(average * 10) / 10, // Round to 1 decimal
      count: data.length,
    };
  } catch (error) {
    console.error("Error getting average rating:", error);
    return { average: 0, count: 0 };
  }
}

/**
 * Add item to cart
 * @param {string} mealId - Meal ID to add
 * @param {number} quantity - Quantity to add (default: 1)
 * @param {string} specialInstructions - Special instructions
 * @param {Object} options - Item options: { selectedSize, selectedSpecifications }
 */
export async function addToCart(
  mealId,
  quantity = 1,
  specialInstructions = "",
  options = {},
) {
  try {
    const userProfile = await getUserProfile();
    if (!userProfile) throw new Error("Authentication required");

    const hasSelectedSize = Object.prototype.hasOwnProperty.call(
      options,
      "selectedSize",
    );
    const hasLegacySize = Object.prototype.hasOwnProperty.call(options, "size");
    const selectedSize = hasSelectedSize
      ? normalizeCartSize(options.selectedSize)
      : hasLegacySize
        ? normalizeCartSize(options.size)
        : null;
    const selectedSpecifications = normalizeCartSpecifications(
      options.selectedSpecifications || options.specifications || [],
    );
    const optionsKey =
      options.optionsKey ||
      buildCartOptionsKey(selectedSize, selectedSpecifications);

    // Check if item already exists in cart
    const { data: existingItem, error: checkError } = await supabase
      .from("chawp_cart_items")
      .select("*")
      .eq("user_id", userProfile.id)
      .eq("meal_id", mealId)
      .eq("options_key", optionsKey)
      .maybeSingle();

    if (checkError) throw checkError;

    if (existingItem) {
      // Update quantity if item exists
      const updatePayload = {
        quantity: existingItem.quantity + quantity,
        special_instructions:
          specialInstructions || existingItem.special_instructions,
        selected_specifications: selectedSpecifications,
        options_key: optionsKey,
        updated_at: new Date().toISOString(),
      };

      // Keep compatibility with databases that still enforce selected_size NOT NULL.
      if (selectedSize !== null) {
        updatePayload.selected_size = selectedSize;
      }

      const { data, error } = await supabase
        .from("chawp_cart_items")
        .update(updatePayload)
        .eq("id", existingItem.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } else {
      // Add new item if it doesn't exist
      const insertPayload = {
        user_id: userProfile.id,
        meal_id: mealId,
        quantity: quantity,
        special_instructions: specialInstructions,
        selected_specifications: selectedSpecifications,
        options_key: optionsKey,
      };

      // Keep compatibility with databases that still enforce selected_size NOT NULL.
      if (selectedSize !== null) {
        insertPayload.selected_size = selectedSize;
      }

      const { data, error } = await supabase
        .from("chawp_cart_items")
        .insert(insertPayload)
        .select()
        .single();

      if (error) {
        // Handle race conditions where another request inserted the same variant first.
        if (error.code === "23505") {
          const { data: duplicateItem, error: duplicateLookupError } =
            await supabase
              .from("chawp_cart_items")
              .select("id, quantity")
              .eq("user_id", userProfile.id)
              .eq("meal_id", mealId)
              .eq("options_key", optionsKey)
              .maybeSingle();

          if (duplicateLookupError) throw duplicateLookupError;

          if (duplicateItem?.id) {
            const retryUpdatePayload = {
              quantity: Number(duplicateItem.quantity || 0) + quantity,
              special_instructions: specialInstructions,
              selected_specifications: selectedSpecifications,
              options_key: optionsKey,
              updated_at: new Date().toISOString(),
            };

            if (selectedSize !== null) {
              retryUpdatePayload.selected_size = selectedSize;
            }

            const { data: retryData, error: retryError } = await supabase
              .from("chawp_cart_items")
              .update(retryUpdatePayload)
              .eq("id", duplicateItem.id)
              .select()
              .single();

            if (retryError) throw retryError;
            return retryData;
          }
        }

        throw error;
      }
      return data;
    }
  } catch (error) {
    console.error("Error adding to cart:", error);
    throw error;
  }
}

/**
 * Update cart item quantity
 * @param {string} cartItemId - Cart item ID
 * @param {number} quantity - New quantity
 */
export async function updateCartItem(cartItemId, quantity) {
  try {
    const userProfile = await getUserProfile();
    if (!userProfile) throw new Error("Authentication required");

    if (quantity <= 0) {
      // Remove item if quantity is 0 or less
      return await removeFromCart(cartItemId);
    }

    const { data, error } = await supabase
      .from("chawp_cart_items")
      .update({
        quantity: quantity,
        updated_at: new Date().toISOString(),
      })
      .eq("id", cartItemId)
      .eq("user_id", userProfile.id) // Ensure user owns the item
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("Error updating cart item:", error);
    throw error;
  }
}

/**
 * Remove item from cart
 * @param {string} cartItemId - Cart item ID to remove
 */
export async function removeFromCart(cartItemId) {
  try {
    const userProfile = await getUserProfile();
    if (!userProfile) throw new Error("Authentication required");

    const { error } = await supabase
      .from("chawp_cart_items")
      .delete()
      .eq("id", cartItemId)
      .eq("user_id", userProfile.id); // Ensure user owns the item

    if (error) throw error;
    return true;
  } catch (error) {
    console.error("Error removing from cart:", error);
    throw error;
  }
}

/**
 * Clear user's cart
 */
export async function clearCart() {
  try {
    const userProfile = await getUserProfile();
    if (!userProfile) throw new Error("Authentication required");

    const { error } = await supabase
      .from("chawp_cart_items")
      .delete()
      .eq("user_id", userProfile.id);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error("Error clearing cart:", error);
    throw error;
  }
}

// ==================== Orders ====================

/**
 * Fetch user's order statistics (total orders count and total spent)
 */
export async function fetchOrderStatistics() {
  try {
    const userProfile = await getUserProfile();
    if (!userProfile) return { totalOrders: 0, totalSpent: 0 };

    // Get count and sum of all orders
    const { data, error } = await supabase
      .from("chawp_orders")
      .select("id, total_amount, status")
      .eq("user_id", userProfile.id)
      .in("status", [
        "delivered",
        "cancelled",
        "pending",
        "confirmed",
        "preparing",
        "out_for_delivery",
      ]);

    if (error) throw error;

    const totalOrders = data?.length || 0;
    const totalSpent =
      data?.reduce((sum, order) => {
        // Only count delivered orders in total spent
        if (order.status === "delivered") {
          return sum + (order.total_amount || 0);
        }
        return sum;
      }, 0) || 0;

    return {
      totalOrders,
      totalSpent,
    };
  } catch (error) {
    console.error("Error fetching order statistics:", error);
    return { totalOrders: 0, totalSpent: 0 };
  }
}

/**
 * Fetch user's active order (if any)
 */
/**
 * Fetch all active orders (not completed/cancelled)
 */
export async function fetchActiveOrders() {
  try {
    const userProfile = await getUserProfile();
    if (!userProfile) return [];

    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from("chawp_orders")
      .select(
        `
        *,
        vendor:chawp_vendors (name, image),
        order_items:chawp_order_items (
          quantity,
          unit_price,
          selected_size,
          selected_specifications,
          meal_image,
          special_instructions,
          meal:chawp_meals (title, image, price)
        )
      `,
      )
      .eq("user_id", userProfile.id)
      .in("status", ["pending", "confirmed", "preparing", "out_for_delivery"])
      .or(`scheduled_for.is.null,scheduled_for.lt.${now}`)
      .order("created_at", { ascending: false });

    if (error) throw error;
    if (!data || data.length === 0) return [];

    // Map all orders to the display format
    return data.map((order) => ({
      id: order.id,
      restaurant: order.vendor.name,
      vendorImage: order.vendor.image,
      eta: "15-25 min", // Placeholder
      status: order.status,
      items: order.order_items.reduce((sum, item) => sum + item.quantity, 0),
      total: order.total_amount,
      meals: order.order_items.map((item) => ({
        name: item.meal.title,
        image: item.meal_image || item.meal.image,
        quantity: item.quantity,
        price:
          Number.isFinite(Number(item.unit_price)) &&
          Number(item.unit_price) > 0
            ? Number(item.unit_price)
            : item.meal.price,
        selectedSize: item.selected_size || null,
        selectedSpecifications: item.selected_specifications || [],
        specialInstructions: item.special_instructions || null,
      })),
      deliveryLocation: order.delivery_location || "UPSA",
      deliveryAddress: order.delivery_address,
      createdAt: order.created_at,
    }));
  } catch (error) {
    console.error("Error fetching active orders:", error);
    throw error;
  }
}

/**
 * Fetch single active order (for backward compatibility)
 * @deprecated Use fetchActiveOrders() instead
 */
export async function fetchActiveOrder() {
  try {
    const orders = await fetchActiveOrders();
    return orders.length > 0 ? orders[0] : null;
  } catch (error) {
    console.error("Error fetching active order:", error);
    throw error;
  }
}

/**
 * Fetch user's upcoming deliveries (scheduled orders)
 */
export async function fetchUpcomingDeliveries() {
  try {
    const userProfile = await getUserProfile();
    if (!userProfile) return [];

    const { data, error } = await supabase
      .from("chawp_orders")
      .select(
        `
        *,
        vendor:chawp_vendors (name, image),
        order_items:chawp_order_items (quantity, meal:chawp_meals(title))
      `,
      )
      .eq("user_id", userProfile.id)
      .not("scheduled_for", "is", null)
      .gte("scheduled_for", new Date().toISOString())
      .order("scheduled_for", { ascending: true });

    if (error) throw error;

    return (data || []).map((order) => {
      // Format the schedule time
      const scheduledDate = new Date(order.scheduled_for);
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);

      let scheduleText;
      if (scheduledDate.toDateString() === now.toDateString()) {
        scheduleText = `Today at ${scheduledDate.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        })}`;
      } else if (scheduledDate.toDateString() === tomorrow.toDateString()) {
        scheduleText = `Tomorrow at ${scheduledDate.toLocaleTimeString(
          "en-US",
          { hour: "numeric", minute: "2-digit", hour12: true },
        )}`;
      } else {
        scheduleText = scheduledDate.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        });
      }

      // Count total items
      const totalItems = order.order_items.reduce(
        (sum, item) => sum + item.quantity,
        0,
      );

      // Get item descriptions
      const itemsText =
        order.order_items.length === 1
          ? order.order_items[0].meal.title
          : `${totalItems} items`;

      return {
        id: order.id,
        restaurant: order.vendor.name,
        image: order.vendor.image,
        schedule: scheduleText,
        items: itemsText,
        total: order.total_amount,
        scheduledFor: order.scheduled_for,
        deliveryLocation: order.delivery_location || "UPSA",
        deliveryAddress: order.delivery_address,
      };
    });
  } catch (error) {
    console.error("Error fetching upcoming deliveries:", error);
    return [];
  }
}

/**
 * Update a scheduled order
 * @param {string} orderId - Order ID
 * @param {Object} updates - Updates to apply (e.g., { scheduled_for: newDate })
 */
export async function updateScheduledOrder(orderId, updates) {
  try {
    const userProfile = await getUserProfile();
    if (!userProfile) throw new Error("Authentication required");

    const { data, error } = await supabase
      .from("chawp_orders")
      .update(updates)
      .eq("id", orderId)
      .eq("user_id", userProfile.id)
      .eq("status", "scheduled")
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("Error updating scheduled order:", error);
    throw error;
  }
}

/**
 * Cancel a scheduled order
 * @param {string} orderId - Order ID
 */
export async function cancelScheduledOrder(orderId) {
  try {
    const userProfile = await getUserProfile();
    if (!userProfile) throw new Error("Authentication required");

    const { data, error } = await supabase
      .from("chawp_orders")
      .update({ status: "cancelled" })
      .eq("id", orderId)
      .eq("user_id", userProfile.id)
      .eq("status", "scheduled")
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("Error cancelling scheduled order:", error);
    throw error;
  }
}

/**
 * Fetch user's order history (paginated) - only delivered orders
 * @param {number} page - Page number
 * @param {number} pageSize - Number of items per page
 */
export async function fetchOrderHistory(page = 1, pageSize = 10) {
  try {
    const userProfile = await getUserProfile();
    if (!userProfile) return { items: [], hasMore: false };

    const { data, error, count } = await supabase
      .from("chawp_orders")
      .select(
        `
        *,
        vendor:chawp_vendors (name, image),
        order_items:chawp_order_items (
          quantity,
          unit_price,
          selected_size,
          selected_specifications,
          meal_image,
          special_instructions,
          meal:chawp_meals (id, title, image, price)
        )
      `,
        { count: "exact" },
      )
      .eq("user_id", userProfile.id)
      .eq("status", "delivered")
      .order("created_at", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    if (error) throw error;

    const items = data.map((order) => ({
      id: order.id,
      restaurant: order.vendor.name,
      image: order.vendor.image,
      date: new Date(order.created_at).toLocaleDateString(),
      meals: order.order_items.map((item) => ({
        name: item.meal?.title || "Unknown Item",
        image: item.meal_image || item.meal?.image || order.vendor.image,
        quantity: item.quantity,
        price:
          Number.isFinite(Number(item.unit_price)) &&
          Number(item.unit_price) > 0
            ? Number(item.unit_price)
            : item.meal?.price || 0,
        selectedSize: item.selected_size || null,
        selectedSpecifications: item.selected_specifications || [],
        specialInstructions: item.special_instructions || null,
      })),
      items: order.order_items.reduce((sum, item) => sum + item.quantity, 0),
      subtotal: Number(order.total_amount) || 0,
      serviceFee: Number(order.service_fee) || 0,
      deliveryFee: Number(order.delivery_fee) || 0,
      total:
        (Number(order.total_amount) || 0) +
        (Number(order.service_fee) || 0) +
        (Number(order.delivery_fee) || 0),
      status: order.status,
      paymentStatus: order.payment_status || "paid",
      rating: order.rating || 0,
      deliveryLocation: order.delivery_location || "UPSA",
      deliveryAddress: order.delivery_address,
    }));

    return {
      items,
      hasMore: count > page * pageSize,
    };
  } catch (error) {
    console.error("Error fetching order history:", error);
    throw error;
  }
}

// ==================== App Settings ====================

/**
 * Fetch app settings (service fee, delivery fee, etc.)
 */
export async function fetchAppSettings() {
  try {
    const { data, error } = await supabase
      .from("chawp_app_settings")
      .select(
        "service_fee, delivery_fee, service_fee_mode, service_fee_percentage, pay_after_delivery_enabled, chawp_min_android_version, chawp_min_ios_version, chawp_android_store_url, chawp_ios_store_url, chawp_release_note, vendor_min_android_version, vendor_min_ios_version, vendor_android_store_url, vendor_ios_store_url, vendor_release_note, delivery_min_android_version, delivery_min_ios_version, delivery_android_store_url, delivery_ios_store_url, delivery_release_note",
      )
      .single();

    if (error) throw error;

    return {
      serviceFee: parseFloat(data.service_fee) || 6,
      deliveryFee: parseFloat(data.delivery_fee) || 5,
      serviceFeeMode:
        data.service_fee_mode === "percentage" ? "percentage" : "flat",
      serviceFeePercentage: parseFloat(data.service_fee_percentage) || 0,
      payAfterDeliveryEnabled: Boolean(data.pay_after_delivery_enabled),
      versionControl: {
        chawp: {
          androidMinVersion: data.chawp_min_android_version || "1.0.0",
          iosMinVersion: data.chawp_min_ios_version || "1.0.0",
          androidStoreUrl: data.chawp_android_store_url || "",
          iosStoreUrl: data.chawp_ios_store_url || "",
          releaseNote: data.chawp_release_note || "",
        },
        vendor: {
          androidMinVersion: data.vendor_min_android_version || "1.0.0",
          iosMinVersion: data.vendor_min_ios_version || "1.0.0",
          androidStoreUrl: data.vendor_android_store_url || "",
          iosStoreUrl: data.vendor_ios_store_url || "",
          releaseNote: data.vendor_release_note || "",
        },
        delivery: {
          androidMinVersion: data.delivery_min_android_version || "1.0.0",
          iosMinVersion: data.delivery_min_ios_version || "1.0.0",
          androidStoreUrl: data.delivery_android_store_url || "",
          iosStoreUrl: data.delivery_ios_store_url || "",
          releaseNote: data.delivery_release_note || "",
        },
      },
    };
  } catch (error) {
    console.error("Error fetching app settings:", error);
    // Return defaults if fetch fails
    return {
      serviceFee: 6,
      deliveryFee: 5,
      serviceFeeMode: "flat",
      serviceFeePercentage: 0,
      payAfterDeliveryEnabled: false,
      versionControl: {
        chawp: {
          androidMinVersion: "1.0.0",
          iosMinVersion: "1.0.0",
          androidStoreUrl: "",
          iosStoreUrl: "",
          releaseNote: "",
        },
        vendor: {
          androidMinVersion: "1.0.0",
          iosMinVersion: "1.0.0",
          androidStoreUrl: "",
          iosStoreUrl: "",
          releaseNote: "",
        },
        delivery: {
          androidMinVersion: "1.0.0",
          iosMinVersion: "1.0.0",
          androidStoreUrl: "",
          iosStoreUrl: "",
          releaseNote: "",
        },
      },
    };
  }
}

/**
 * Update app settings (admin/super_admin only)
 * @param {number} serviceFee - Service fee amount
 * @param {number} deliveryFee - Delivery fee amount
 */
export async function updateAppSettings(settings) {
  try {
    const parsedServiceFee = parseFloat(settings.serviceFee);
    const parsedDeliveryFee = parseFloat(settings.deliveryFee);
    const serviceFeeMode =
      settings.serviceFeeMode === "percentage" ? "percentage" : "flat";
    const parsedServiceFeePercentage = parseFloat(
      settings.serviceFeePercentage,
    );

    const versionControl = settings.versionControl || {};
    const normalizeVersion = (value) =>
      String(value || "")
        .trim()
        .replace(/[^0-9.]/g, "") || "1.0.0";
    const normalizeUrl = (value) => String(value || "").trim();
    const normalizeNote = (value) => String(value || "").trim();

    // First, check if the row exists
    const { data: existingData, error: checkError } = await supabase
      .from("chawp_app_settings")
      .select("id")
      .eq("id", 1)
      .maybeSingle();

    if (checkError) throw checkError;

    if (!existingData) {
      // Row doesn't exist, insert it
      const { error } = await supabase.from("chawp_app_settings").insert({
        id: 1,
        service_fee: parsedServiceFee,
        delivery_fee: parsedDeliveryFee,
        service_fee_mode: serviceFeeMode,
        service_fee_percentage:
          Number.isFinite(parsedServiceFeePercentage) &&
          parsedServiceFeePercentage >= 0
            ? parsedServiceFeePercentage
            : 0,
        chawp_min_android_version: normalizeVersion(
          versionControl?.chawp?.androidMinVersion,
        ),
        chawp_min_ios_version: normalizeVersion(
          versionControl?.chawp?.iosMinVersion,
        ),
        vendor_min_android_version: normalizeVersion(
          versionControl?.vendor?.androidMinVersion,
        ),
        vendor_min_ios_version: normalizeVersion(
          versionControl?.vendor?.iosMinVersion,
        ),
        delivery_min_android_version: normalizeVersion(
          versionControl?.delivery?.androidMinVersion,
        ),
        delivery_min_ios_version: normalizeVersion(
          versionControl?.delivery?.iosMinVersion,
        ),
        chawp_android_store_url: normalizeUrl(
          versionControl?.chawp?.androidStoreUrl,
        ),
        chawp_ios_store_url: normalizeUrl(versionControl?.chawp?.iosStoreUrl),
        chawp_release_note: normalizeNote(versionControl?.chawp?.releaseNote),
        vendor_android_store_url: normalizeUrl(
          versionControl?.vendor?.androidStoreUrl,
        ),
        vendor_ios_store_url: normalizeUrl(versionControl?.vendor?.iosStoreUrl),
        vendor_release_note: normalizeNote(versionControl?.vendor?.releaseNote),
        delivery_android_store_url: normalizeUrl(
          versionControl?.delivery?.androidStoreUrl,
        ),
        delivery_ios_store_url: normalizeUrl(
          versionControl?.delivery?.iosStoreUrl,
        ),
        delivery_release_note: normalizeNote(
          versionControl?.delivery?.releaseNote,
        ),
      });

      if (error) throw error;
    } else {
      // Row exists, update it
      const { error } = await supabase
        .from("chawp_app_settings")
        .update({
          service_fee: parsedServiceFee,
          delivery_fee: parsedDeliveryFee,
          service_fee_mode: serviceFeeMode,
          service_fee_percentage:
            Number.isFinite(parsedServiceFeePercentage) &&
            parsedServiceFeePercentage >= 0
              ? parsedServiceFeePercentage
              : 0,
          chawp_min_android_version: normalizeVersion(
            versionControl?.chawp?.androidMinVersion,
          ),
          chawp_min_ios_version: normalizeVersion(
            versionControl?.chawp?.iosMinVersion,
          ),
          vendor_min_android_version: normalizeVersion(
            versionControl?.vendor?.androidMinVersion,
          ),
          vendor_min_ios_version: normalizeVersion(
            versionControl?.vendor?.iosMinVersion,
          ),
          delivery_min_android_version: normalizeVersion(
            versionControl?.delivery?.androidMinVersion,
          ),
          delivery_min_ios_version: normalizeVersion(
            versionControl?.delivery?.iosMinVersion,
          ),
          chawp_android_store_url: normalizeUrl(
            versionControl?.chawp?.androidStoreUrl,
          ),
          chawp_ios_store_url: normalizeUrl(versionControl?.chawp?.iosStoreUrl),
          chawp_release_note: normalizeNote(versionControl?.chawp?.releaseNote),
          vendor_android_store_url: normalizeUrl(
            versionControl?.vendor?.androidStoreUrl,
          ),
          vendor_ios_store_url: normalizeUrl(
            versionControl?.vendor?.iosStoreUrl,
          ),
          vendor_release_note: normalizeNote(
            versionControl?.vendor?.releaseNote,
          ),
          delivery_android_store_url: normalizeUrl(
            versionControl?.delivery?.androidStoreUrl,
          ),
          delivery_ios_store_url: normalizeUrl(
            versionControl?.delivery?.iosStoreUrl,
          ),
          delivery_release_note: normalizeNote(
            versionControl?.delivery?.releaseNote,
          ),
          updated_at: new Date().toISOString(),
        })
        .eq("id", 1);

      if (error) throw error;
    }

    // Return the values we set (we know they were saved since there was no error)
    return {
      success: true,
      serviceFee: parsedServiceFee,
      deliveryFee: parsedDeliveryFee,
      serviceFeeMode,
      serviceFeePercentage:
        Number.isFinite(parsedServiceFeePercentage) &&
        parsedServiceFeePercentage >= 0
          ? parsedServiceFeePercentage
          : 0,
      versionControl: {
        chawp: {
          androidMinVersion: normalizeVersion(
            versionControl?.chawp?.androidMinVersion,
          ),
          iosMinVersion: normalizeVersion(versionControl?.chawp?.iosMinVersion),
          androidStoreUrl: normalizeUrl(versionControl?.chawp?.androidStoreUrl),
          iosStoreUrl: normalizeUrl(versionControl?.chawp?.iosStoreUrl),
          releaseNote: normalizeNote(versionControl?.chawp?.releaseNote),
        },
        vendor: {
          androidMinVersion: normalizeVersion(
            versionControl?.vendor?.androidMinVersion,
          ),
          iosMinVersion: normalizeVersion(
            versionControl?.vendor?.iosMinVersion,
          ),
          androidStoreUrl: normalizeUrl(
            versionControl?.vendor?.androidStoreUrl,
          ),
          iosStoreUrl: normalizeUrl(versionControl?.vendor?.iosStoreUrl),
          releaseNote: normalizeNote(versionControl?.vendor?.releaseNote),
        },
        delivery: {
          androidMinVersion: normalizeVersion(
            versionControl?.delivery?.androidMinVersion,
          ),
          iosMinVersion: normalizeVersion(
            versionControl?.delivery?.iosMinVersion,
          ),
          androidStoreUrl: normalizeUrl(
            versionControl?.delivery?.androidStoreUrl,
          ),
          iosStoreUrl: normalizeUrl(versionControl?.delivery?.iosStoreUrl),
          releaseNote: normalizeNote(versionControl?.delivery?.releaseNote),
        },
      },
    };
  } catch (error) {
    console.error("Error updating app settings:", error);
    throw error;
  }
}
/**
 * Subscribe to real-time updates for active orders
 * @param {function} onUpdate - Callback function when orders change
 * @returns {function} - Unsubscribe function
 */
export function subscribeToActiveOrders(onUpdate) {
  let unsubscribeRef = null;

  const setupSubscription = async () => {
    try {
      const userProfile = await getUserProfile();
      if (!userProfile) {
        console.warn("Cannot setup subscription: user profile not found");
        return;
      }

      console.log(
        "Setting up active orders subscription for user:",
        userProfile.id,
      );

      const channel = supabase
        .channel(`active-orders-${userProfile.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "chawp_orders",
            filter: `user_id=eq.${userProfile.id}`,
          },
          async (payload) => {
            console.log("Active order update received:", payload);
            try {
              const updatedOrders = await fetchActiveOrders();
              onUpdate(updatedOrders);
            } catch (error) {
              console.error("Error fetching updated orders:", error);
            }
          },
        )
        .subscribe((status) => {
          console.log("Active orders subscription status:", status);
        });

      unsubscribeRef = () => {
        supabase.removeChannel(channel);
      };
    } catch (error) {
      console.error("Error setting up active orders subscription:", error);
    }
  };

  // Setup subscription immediately
  setupSubscription();

  // Return unsubscribe function
  return () => {
    if (unsubscribeRef) unsubscribeRef();
  };
}

/**
 * Subscribe to real-time updates for order history
 * @param {function} onUpdate - Callback function when orders change
 * @returns {function} - Unsubscribe function
 */
export function subscribeToOrderHistory(onUpdate) {
  let unsubscribeRef = null;

  const setupSubscription = async () => {
    try {
      const userProfile = await getUserProfile();
      if (!userProfile) {
        console.warn("Cannot setup subscription: user profile not found");
        return;
      }

      console.log(
        "Setting up order history subscription for user:",
        userProfile.id,
      );

      const channel = supabase
        .channel(`order-history-${userProfile.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "chawp_orders",
            filter: `user_id=eq.${userProfile.id}`,
          },
          async (payload) => {
            console.log("Order history update received:", payload);
            try {
              const updatedHistory = await fetchOrderHistory(1, 10);
              onUpdate(updatedHistory);
            } catch (error) {
              console.error("Error fetching updated order history:", error);
            }
          },
        )
        .subscribe((status) => {
          console.log("Order history subscription status:", status);
        });

      unsubscribeRef = () => {
        supabase.removeChannel(channel);
      };
    } catch (error) {
      console.error("Error setting up order history subscription:", error);
    }
  };

  // Setup subscription immediately
  setupSubscription();

  // Return unsubscribe function
  return () => {
    if (unsubscribeRef) unsubscribeRef();
  };
}

/**
 * Subscribe to real-time updates for upcoming deliveries
 * @param {function} onUpdate - Callback function when deliveries change
 * @returns {function} - Unsubscribe function
 */
export function subscribeToUpcomingDeliveries(onUpdate) {
  let unsubscribeRef = null;

  const setupSubscription = async () => {
    try {
      const userProfile = await getUserProfile();
      if (!userProfile) {
        console.warn("Cannot setup subscription: user profile not found");
        return;
      }

      console.log(
        "Setting up upcoming deliveries subscription for user:",
        userProfile.id,
      );

      const channel = supabase
        .channel(`upcoming-deliveries-${userProfile.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "chawp_orders",
            filter: `user_id=eq.${userProfile.id}`,
          },
          async (payload) => {
            console.log("Upcoming delivery update received:", payload);
            try {
              const updatedDeliveries = await fetchUpcomingDeliveries();
              onUpdate(updatedDeliveries);
            } catch (error) {
              console.error("Error fetching updated deliveries:", error);
            }
          },
        )
        .subscribe((status) => {
          console.log("Upcoming deliveries subscription status:", status);
        });

      unsubscribeRef = () => {
        supabase.removeChannel(channel);
      };
    } catch (error) {
      console.error(
        "Error setting up upcoming deliveries subscription:",
        error,
      );
    }
  };

  // Setup subscription immediately
  setupSubscription();

  // Return unsubscribe function
  return () => {
    if (unsubscribeRef) unsubscribeRef();
  };
}

/**
 * Subscribe to real-time updates for order statistics
 * @param {function} onUpdate - Callback function when statistics change
 * @returns {function} - Unsubscribe function
 */
export function subscribeToOrderStatistics(onUpdate) {
  let unsubscribeRef = null;

  const setupSubscription = async () => {
    try {
      const userProfile = await getUserProfile();
      if (!userProfile) {
        console.warn("Cannot setup subscription: user profile not found");
        return;
      }

      console.log(
        "Setting up order statistics subscription for user:",
        userProfile.id,
      );

      const channel = supabase
        .channel(`order-stats-${userProfile.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "chawp_orders",
            filter: `user_id=eq.${userProfile.id}`,
          },
          async (payload) => {
            console.log("Order statistics update received:", payload);
            try {
              const updatedStats = await fetchOrderStatistics();
              onUpdate(updatedStats);
            } catch (error) {
              console.error("Error fetching updated statistics:", error);
            }
          },
        )
        .subscribe((status) => {
          console.log("Order statistics subscription status:", status);
        });

      unsubscribeRef = () => {
        supabase.removeChannel(channel);
      };
    } catch (error) {
      console.error("Error setting up order statistics subscription:", error);
    }
  };

  // Setup subscription immediately
  setupSubscription();

  // Return unsubscribe function
  return () => {
    if (unsubscribeRef) unsubscribeRef();
  };
}
