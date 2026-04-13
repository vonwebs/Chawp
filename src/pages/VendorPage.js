import React, { useEffect, useMemo, useState } from "react";
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { spacing, radii, typography, responsive } from "../theme";
import { useTheme } from "../contexts/ThemeContext";
import { fetchMeals } from "../services/api";
import {
  checkVendorStatus,
  getAverageRating,
  fetchVendorHours,
} from "../services/api";
import RatingStars from "../components/RatingStars";
import CommentsSection from "../components/CommentsSection";
import LoadingPlaceholder from "../components/LoadingPlaceholder";

export default function VendorPage({
  vendor,
  onMealSelect,
  onClose,
  cartItems,
  addToCart,
  updateCartQuantity,
  addingToCart = null,
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [meals, setMeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [vendorStatus, setVendorStatus] = useState({
    isOpen: true,
    status: "open",
  });
  const [ratingInfo, setRatingInfo] = useState({ average: 0, count: 0 });
  const [vendorHours, setVendorHours] = useState([]);
  const [hoursLoading, setHoursLoading] = useState(true);

  useEffect(() => {
    loadMeals();
    loadVendorData();
  }, [vendor.id]);

  const loadMeals = async () => {
    try {
      setLoading(true);
      const mealsData = await fetchMeals({
        vendorId: vendor.id,
        status: "available",
      });
      setMeals(mealsData);
    } catch (error) {
      console.error("Error loading meals:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadVendorData = async () => {
    try {
      setHoursLoading(true);
      // Load vendor status
      const status = await checkVendorStatus(vendor.id);
      setVendorStatus(status);

      // Load rating info
      const rating = await getAverageRating("vendor", vendor.id);
      setRatingInfo(rating);

      // Load vendor hours
      const hours = await fetchVendorHours(vendor.id);
      setVendorHours(hours);
    } catch (error) {
      console.error("Error loading vendor data:", error);
    } finally {
      setHoursLoading(false);
    }
  };

  const renderHourSkeleton = (index) => (
    <View key={`hour-skeleton-${index}`} style={styles.hourItem}>
      <LoadingPlaceholder width="38%" height={16} borderRadius={6} />
      <LoadingPlaceholder width="34%" height={16} borderRadius={6} />
    </View>
  );

  const renderMenuSkeletonCard = (index) => (
    <View key={`menu-skeleton-${index}`} style={styles.mealCard}>
      <View style={styles.mealImageSkeleton}>
        <LoadingPlaceholder
          width="100%"
          height="100%"
          borderRadius={radii.lg}
        />
      </View>
      <View style={styles.mealInfo}>
        <LoadingPlaceholder width="56%" height={16} borderRadius={6} />
        <LoadingPlaceholder width="88%" height={12} borderRadius={6} />
        <LoadingPlaceholder width="76%" height={12} borderRadius={6} />
        <View style={styles.mealFooter}>
          <LoadingPlaceholder width={70} height={18} borderRadius={6} />
          <LoadingPlaceholder width={32} height={32} borderRadius={radii.sm} />
        </View>
      </View>
    </View>
  );

  const handleMealPress = (meal) => {
    if (onMealSelect) {
      const mergedVendor = {
        ...vendor,
        ...(meal?.vendor || {}),
        operational_status: vendorStatus.isOpen
          ? meal?.vendor?.operational_status ||
            vendor?.operational_status ||
            "open"
          : "closed",
        is_closed_today:
          vendorStatus.isOpen === false || meal?.vendor?.is_closed_today === true,
      };

      onMealSelect({
        ...meal,
        vendor: mergedVendor,
      });
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Fixed Header */}
      <View style={styles.fixedHeader}>
        <TouchableOpacity
          style={[styles.backButton, { backgroundColor: colors.overlay }]}
          onPress={onClose}
        >
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Vendor Hero */}
        <View style={styles.heroContainer}>
          <Image source={{ uri: vendor.image }} style={styles.heroImage} />
          <LinearGradient
            colors={["transparent", "rgba(7, 11, 22, 0.8)"]}
            style={styles.heroGradient}
          >
            <View style={styles.heroContent}>
              <View style={styles.categoryBadge}>
                <Text style={styles.categoryText}>
                  {vendor.cuisine_type || "Restaurant"}
                </Text>
              </View>
            </View>
          </LinearGradient>
        </View>

        {/* Vendor Info */}
        <View style={styles.vendorInfo}>
          <View style={styles.vendorHeader}>
            <Text style={styles.vendorName}>{vendor.name}</Text>
            <View
              style={[
                styles.statusBadge,
                {
                  backgroundColor: vendorStatus.isOpen
                    ? colors.success
                    : colors.danger,
                },
              ]}
            >
              <Text style={styles.statusText}>
                {vendorStatus.isOpen ? "Open" : "Closed"}
              </Text>
            </View>
          </View>

          <View style={styles.vendorMeta}>
            <RatingStars
              rating={ratingInfo.average || vendor.rating || 0}
              size={16}
              count={ratingInfo.count}
            />
            <View style={styles.dot} />
            <Ionicons
              name="time-outline"
              size={16}
              color={colors.textSecondary}
            />
            <Text style={styles.vendorMetaText}>
              {vendor.delivery_time || "N/A"}
            </Text>
            <View style={styles.dot} />
            <Ionicons
              name="location-outline"
              size={16}
              color={colors.textSecondary}
            />
            <Text style={styles.vendorMetaText}>
              {vendor.distance || "N/A"}
            </Text>
          </View>

          {!vendorStatus.isOpen && vendorStatus.status !== "closed" && (
            <Text style={styles.closedMessage}>
              Currently closed. Opens at {vendorStatus.openTime}
            </Text>
          )}

          <Text style={styles.vendorDescription}>
            {vendor.description ||
              "Delicious food made with passion and served with care."}
          </Text>
          <View style={styles.tagRow}>
            {vendor.tags &&
              vendor.tags.map((tag) => (
                <View key={tag} style={styles.tagPill}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
          </View>
        </View>

        {/* Operating Hours Section */}
        {(hoursLoading || vendorHours.length > 0) && (
          <View style={styles.hoursSection}>
            <Text style={styles.sectionTitle}>Operating Hours</Text>
            <View style={styles.hoursList}>
              {hoursLoading
                ? Array.from({ length: 7 }).map((_, index) =>
                    renderHourSkeleton(index),
                  )
                : vendorHours.map((hour) => {
                    const dayNames = [
                      "Sunday",
                      "Monday",
                      "Tuesday",
                      "Wednesday",
                      "Thursday",
                      "Friday",
                      "Saturday",
                    ];
                    const isToday = hour.day_of_week === new Date().getDay();
                    const isClosed = hour.is_closed;

                    return (
                      <View
                        key={hour.day_of_week}
                        style={[styles.hourItem, isToday && styles.todayItem]}
                      >
                        <Text
                          style={[styles.dayText, isToday && styles.todayText]}
                        >
                          {dayNames[hour.day_of_week]}
                        </Text>
                        <Text
                          style={[
                            styles.timeText,
                            isClosed && styles.closedText,
                          ]}
                        >
                          {isClosed
                            ? "Closed"
                            : `${hour.open_time} - ${hour.close_time}`}
                        </Text>
                      </View>
                    );
                  })}
            </View>
          </View>
        )}

        {/* Menu Section */}
        <View style={styles.menuSection}>
          <Text style={styles.sectionTitle}>Menu</Text>
          {loading ? (
            <View style={styles.mealsGrid}>
              {Array.from({ length: 4 }).map((_, index) =>
                renderMenuSkeletonCard(index),
              )}
            </View>
          ) : meals.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons
                name="restaurant-outline"
                size={64}
                color={colors.textMuted}
              />
              <Text style={styles.emptyText}>No items available</Text>
            </View>
          ) : (
            <View style={styles.mealsGrid}>
              {meals.map((meal) => {
                const cartItem = cartItems[meal.id];
                const quantity = cartItem?.quantity || 0;

                return (
                  <TouchableOpacity
                    key={meal.id}
                    style={styles.mealCard}
                    onPress={() => handleMealPress(meal)}
                    activeOpacity={0.8}
                  >
                    <Image
                      source={{ uri: meal.images?.[0] || meal.image }}
                      style={styles.mealImage}
                    />
                    <View style={styles.mealInfo}>
                      <Text style={styles.mealTitle}>{meal.title}</Text>
                      <Text style={styles.mealDescription} numberOfLines={2}>
                        {meal.description || "Delicious and freshly prepared."}
                      </Text>
                      <View style={styles.mealFooter}>
                        <Text style={styles.mealPrice}>
                          GH₵{meal.price.toFixed(2)}
                        </Text>
                        {quantity > 0 ? (
                          <View style={styles.quantityControls}>
                            <TouchableOpacity
                              style={styles.quantityButton}
                              onPress={() => updateCartQuantity(meal.id, -1)}
                            >
                              <Ionicons
                                name="remove"
                                size={14}
                                color={colors.card}
                              />
                            </TouchableOpacity>
                            <Text style={styles.quantityText}>{quantity}</Text>
                            <TouchableOpacity
                              style={styles.quantityButton}
                              onPress={() => updateCartQuantity(meal.id, 1)}
                            >
                              <Ionicons
                                name="add"
                                size={14}
                                color={colors.card}
                              />
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <TouchableOpacity
                            style={[
                              styles.addButton,
                              (addingToCart === meal.id ||
                                !vendorStatus.isOpen) && { opacity: 0.5 },
                            ]}
                            onPress={() => addToCart(meal)}
                            disabled={
                              addingToCart === meal.id || !vendorStatus.isOpen
                            }
                          >
                            {addingToCart === meal.id ? (
                              <LoadingPlaceholder
                                width={16}
                                height={16}
                                borderRadius={8}
                              />
                            ) : (
                              <Ionicons
                                name={
                                  vendorStatus.isOpen ? "add" : "lock-closed"
                                }
                                size={16}
                                color={colors.card}
                              />
                            )}
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {/* Reviews Section */}
        <View style={styles.reviewsSection}>
          <CommentsSection targetType="vendor" targetId={vendor.id} />
        </View>
      </ScrollView>
    </View>
  );
}

const createStyles = (colors) => {
  const staticColors = colors;
  return StyleSheet.create({
    container: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: staticColors.background,
      zIndex: 4000,
    },
    fixedHeader: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      zIndex: 10,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingTop: spacing.xl + 20,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.md,
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: radii.md,
      backgroundColor: staticColors.overlay,
      alignItems: "center",
      justifyContent: "center",
    },
    shareButton: {
      width: 40,
      height: 40,
      borderRadius: radii.md,
      backgroundColor: staticColors.overlay,
      alignItems: "center",
      justifyContent: "center",
    },
    scrollView: {
      flex: 1,
    },
    content: {
      paddingBottom: 120,
    },
    heroContainer: {
      height: 300,
      position: "relative",
      marginTop: 0,
    },
    heroImage: {
      width: "100%",
      height: "100%",
    },
    heroGradient: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      height: 100,
      justifyContent: "flex-end",
    },
    heroContent: {
      padding: spacing.lg,
    },
    categoryBadge: {
      backgroundColor: staticColors.overlay,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radii.pill,
      alignSelf: "flex-start",
    },
    categoryText: {
      color: staticColors.textPrimary,
      fontSize: 12,
      fontWeight: "600",
    },
    vendorInfo: {
      padding: spacing.lg,
      gap: spacing.md,
    },
    vendorHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    vendorName: {
      ...typography.headline,
      color: staticColors.textPrimary,
      flex: 1,
    },
    statusBadge: {
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: radii.sm,
    },
    statusText: {
      color: staticColors.card,
      fontSize: 12,
      fontWeight: "600",
    },
    closedMessage: {
      ...typography.body,
      color: staticColors.danger,
      fontSize: 14,
    },
    vendorMeta: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
    },
    vendorRating: {
      color: staticColors.textPrimary,
      fontWeight: "600",
    },
    vendorMetaText: {
      color: staticColors.textSecondary,
    },
    dot: {
      width: 4,
      height: 4,
      borderRadius: 2,
      backgroundColor: staticColors.textMuted,
    },
    vendorDescription: {
      color: staticColors.textSecondary,
      lineHeight: 20,
    },
    tagRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
    },
    tagPill: {
      backgroundColor: staticColors.surface,
      borderRadius: radii.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    tagText: {
      color: staticColors.textSecondary,
      fontSize: 12,
      fontWeight: "600",
    },
    hoursSection: {
      padding: spacing.lg,
      paddingTop: 0,
    },
    hoursList: {
      backgroundColor: staticColors.surface,
      borderRadius: radii.md,
      padding: spacing.md,
      gap: spacing.sm,
    },
    hourItem: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: spacing.xs,
    },
    todayItem: {
      backgroundColor: staticColors.overlay,
      borderRadius: radii.sm,
      paddingHorizontal: spacing.sm,
      marginHorizontal: -spacing.sm,
    },
    dayText: {
      ...typography.body,
      color: staticColors.textPrimary,
      fontWeight: "500",
    },
    todayText: {
      color: staticColors.primary,
      fontWeight: "600",
    },
    timeText: {
      ...typography.body,
      color: staticColors.textSecondary,
    },
    closedText: {
      color: staticColors.danger,
      fontStyle: "italic",
    },
    menuSection: {
      padding: spacing.lg,
      gap: spacing.md,
    },
    sectionTitle: {
      ...typography.title,
      color: staticColors.textPrimary,
    },
    loadingContainer: {
      alignItems: "center",
      paddingVertical: spacing.xl,
    },
    loadingText: {
      color: staticColors.textSecondary,
      fontSize: 16,
    },
    emptyContainer: {
      alignItems: "center",
      paddingVertical: spacing.xl * 2,
      gap: spacing.md,
    },
    emptyText: {
      color: staticColors.textMuted,
      fontSize: 16,
    },
    mealsGrid: {
      gap: spacing.md,
    },
    mealCard: {
      flexDirection: "row",
      backgroundColor: staticColors.card,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: staticColors.border,
      overflow: "hidden",
    },
    mealImage: {
      width: responsive.isSmallDevice ? 80 : 100,
      height: responsive.isSmallDevice ? 80 : 100,
    },
    mealImageSkeleton: {
      width: responsive.isSmallDevice ? 80 : 100,
      height: responsive.isSmallDevice ? 80 : 100,
      borderTopLeftRadius: radii.lg,
      borderBottomLeftRadius: radii.lg,
      overflow: "hidden",
    },
    mealInfo: {
      flex: 1,
      padding: spacing.md,
      gap: spacing.sm,
    },
    mealTitle: {
      ...typography.body,
      color: staticColors.textPrimary,
      fontWeight: "600",
    },
    mealDescription: {
      color: staticColors.textSecondary,
      fontSize: 13,
      lineHeight: 18,
    },
    mealFooter: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    mealPrice: {
      ...typography.title,
      color: staticColors.textPrimary,
      fontSize: 16,
    },
    addButton: {
      width: 32,
      height: 32,
      borderRadius: radii.sm,
      backgroundColor: staticColors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    quantityControls: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
    },
    quantityButton: {
      width: 24,
      height: 24,
      borderRadius: radii.sm,
      backgroundColor: staticColors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    quantityText: {
      color: staticColors.textPrimary,
      fontSize: 14,
      fontWeight: "600",
      minWidth: 20,
      textAlign: "center",
    },
    reviewsSection: {
      padding: spacing.lg,
      paddingTop: 0,
    },
  });
};
