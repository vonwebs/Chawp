import React, { useMemo, useState } from "react";
import {
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { spacing, radii, typography, responsive } from "../theme";
import { useTheme } from "../contexts/ThemeContext";
import EmptyState from "../components/EmptyState";
import LoadingPlaceholder from "../components/LoadingPlaceholder";
import {
  fetchActiveOrders,
  fetchUpcomingDeliveries,
  fetchOrderStatistics,
  subscribeToActiveOrders,
  subscribeToUpcomingDeliveries,
  subscribeToOrderStatistics,
} from "../services/api";
import { useDataFetching } from "../hooks/useDataFetching";

// Helper function to format status text
const formatStatus = (status) => {
  const statusMap = {
    pending: "Order Received",
    confirmed: "Confirmed",
    preparing: "Preparing",
    out_for_delivery: "Out for Delivery",
    delivered: "Delivered",
  };
  return statusMap[status] || status;
};

// Helper function to get status badge color
const getStatusColor = (status, colorsToUse) => {
  const colorMap = {
    pending: {
      backgroundColor: colorsToUse.accent + "20",
      borderColor: colorsToUse.accent,
    },
    confirmed: {
      backgroundColor: colorsToUse.primary + "20",
      borderColor: colorsToUse.primary,
    },
    preparing: { backgroundColor: "#F59E0B20", borderColor: "#F59E0B" },
    out_for_delivery: { backgroundColor: "#10B98120", borderColor: "#10B981" },
    delivered: { backgroundColor: "#10B98130", borderColor: "#10B981" },
  };
  return colorMap[status] || colorMap.pending;
};

const formatSizeLabel = (size) => {
  const normalized = String(size || "")
    .trim()
    .toLowerCase();
  if (!normalized) return null;

  return normalized
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

const buildMealMeta = (meal) => {
  const parts = [];
  const sizeLabel = formatSizeLabel(meal?.selectedSize);
  if (sizeLabel) parts.push(`Size: ${sizeLabel}`);

  const specs = Array.isArray(meal?.selectedSpecifications)
    ? meal.selectedSpecifications.filter(Boolean)
    : [];
  if (specs.length) parts.push(`Specs: ${specs.join(", ")}`);

  if (meal?.specialInstructions) {
    parts.push(`Note: ${meal.specialInstructions}`);
  }

  return parts.join(" • ");
};

export default function OrdersPage() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [showTrackingModal, setShowTrackingModal] = useState(false);

  // Fetch order data - use cache keys to persist data across navigation
  const {
    data: activeOrdersData,
    loading: activeOrdersLoading,
    refresh: refreshActiveOrders,
    setData: setActiveOrdersData,
  } = useDataFetching(fetchActiveOrders, [], "active-orders");
  const {
    data: upcomingDeliveriesData,
    loading: upcomingLoading,
    refresh: refreshUpcoming,
    setData: setUpcomingDeliveriesData,
  } = useDataFetching(fetchUpcomingDeliveries, [], "upcoming-deliveries");
  const {
    data: orderStats,
    loading: statsLoading,
    refresh: refreshOrderStats,
    setData: setOrderStatsData,
  } = useDataFetching(fetchOrderStatistics, [], "order-stats");

  // Set up real-time subscriptions
  React.useEffect(() => {
    console.log("Setting up real-time subscriptions for orders");

    // Subscribe to active orders updates
    const unsubscribeActiveOrders = subscribeToActiveOrders((updatedOrders) => {
      console.log("Active orders updated:", updatedOrders.length);
      console.log(
        "Order structure:",
        updatedOrders.map((o) => ({
          id: o.id,
          restaurant: o.restaurant,
          mealCount: o.meals?.length || 0,
          meals: o.meals?.map((m) => m.name) || [],
        })),
      );
      setActiveOrdersData(updatedOrders);
    });

    // Subscribe to upcoming deliveries updates
    const unsubscribeUpcomingDeliveries = subscribeToUpcomingDeliveries(
      (updatedDeliveries) => {
        console.log("Upcoming deliveries updated:", updatedDeliveries.length);
        setUpcomingDeliveriesData(updatedDeliveries);
      },
    );

    // Subscribe to order statistics updates
    const unsubscribeOrderStats = subscribeToOrderStatistics((updatedStats) => {
      console.log("Order statistics updated");
      setOrderStatsData(updatedStats);
    });

    // Cleanup subscriptions on unmount
    return () => {
      console.log("Cleaning up real-time subscriptions");
      unsubscribeActiveOrders();
      unsubscribeUpcomingDeliveries();
      unsubscribeOrderStats();
    };
  }, []);

  // Pull to refresh handler
  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      refreshActiveOrders(),
      refreshUpcoming(),
      refreshOrderStats(),
    ]);
    setRefreshing(false);
  };

  // Calculate total amount for all active orders
  const activeOrdersTotal = activeOrdersData
    ? activeOrdersData.reduce((sum, order) => sum + (order.total || 0), 0)
    : 0;

  return (
    <View
      style={[styles.pageContainer, { backgroundColor: colors.background }]}
    >
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            Orders
          </Text>
          <TouchableOpacity style={styles.headerButton}>
            <Text
              style={[styles.headerButtonText, { color: colors.textSecondary }]}
            >
              Order settings
            </Text>
            <Ionicons
              name="chevron-forward"
              size={16}
              color={colors.textSecondary}
            />
          </TouchableOpacity>
        </View>

        {/* Golden Tickets - Order Statistics */}
        <View style={styles.statsContainer}>
          <View
            style={[
              styles.statCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.accent,
                shadowColor: colors.accent,
              },
            ]}
          >
            <View
              style={[
                styles.statIconWrapper,
                { backgroundColor: colors.surface },
              ]}
            >
              <Ionicons
                name="receipt-outline"
                size={24}
                color={colors.accent}
              />
            </View>
            <View style={styles.statContent}>
              <Text style={[styles.statValue, { color: colors.textPrimary }]}>
                {orderStats?.totalOrders || 0}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                Total Orders
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.statCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.accent,
                shadowColor: colors.accent,
              },
            ]}
          >
            <View
              style={[
                styles.statIconWrapper,
                { backgroundColor: colors.surface },
              ]}
            >
              <Ionicons name="cart-outline" size={24} color={colors.primary} />
            </View>
            <View style={styles.statContent}>
              <Text style={[styles.statValue, { color: colors.textPrimary }]}>
                GH₵{activeOrdersTotal.toFixed(2)}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                Active Orders Total
              </Text>
            </View>
          </View>
        </View>

        <SectionHeader
          title="Active orders"
          actionLabel={
            activeOrdersData?.length > 0
              ? `${activeOrdersData.length} active`
              : ""
          }
          colors={colors}
          styles={styles}
        />
        {activeOrdersLoading ? (
          <View style={styles.loadingContainer}>
            <LoadingPlaceholder width={96} height={12} borderRadius={8} />
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
              Loading active orders...
            </Text>
          </View>
        ) : (
          <View style={styles.activeOrdersList}>
            {!activeOrdersData || activeOrdersData.length === 0 ? (
              <EmptyState
                icon="receipt-outline"
                title="No active orders"
                message="Your current orders will appear here"
              />
            ) : (
              activeOrdersData.map((order) => (
                <View
                  key={order.id}
                  style={[
                    styles.activeOrderCard,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  {/* Compact Header with Vendor, Status, and Total */}
                  <View style={styles.compactCardHeader}>
                    <View style={styles.compactHeaderLeft}>
                      <Image
                        source={{ uri: order.vendorImage }}
                        style={styles.compactVendorImage}
                      />
                      <View style={styles.compactVendorInfo}>
                        <Text
                          style={[
                            styles.compactRestaurantName,
                            { color: colors.textPrimary },
                          ]}
                        >
                          {order.restaurant}
                        </Text>
                        <Text
                          style={[
                            styles.compactOrderId,
                            { color: colors.textSecondary },
                          ]}
                        >
                          Order #
                          {order.id?.substring(0, 8).toUpperCase() || "N/A"} •{" "}
                          {order.meals?.length || 0}{" "}
                          {order.meals?.length === 1 ? "item" : "items"}
                        </Text>
                        <View style={styles.compactStatusRow}>
                          <View
                            style={[
                              styles.statusBadge,
                              getStatusColor(order.status, colors),
                            ]}
                          >
                            <Text
                              style={[
                                styles.statusText,
                                { color: colors.textPrimary },
                              ]}
                            >
                              {formatStatus(order.status)}
                            </Text>
                          </View>
                          <Ionicons
                            name="time-outline"
                            size={12}
                            color={colors.accent}
                          />
                          <Text
                            style={[
                              styles.etaText,
                              { color: colors.textSecondary },
                            ]}
                          >
                            {order.eta}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <View style={styles.compactTotal}>
                      <Text
                        style={[
                          styles.compactTotalAmount,
                          { color: colors.primary },
                        ]}
                      >
                        GH₵{order.total?.toFixed(2)}
                      </Text>
                    </View>
                  </View>

                  {/* All meal items with images in grid */}
                  <View style={styles.compactItemsGrid}>
                    {order.meals?.map((meal, index) => (
                      <View
                        key={index}
                        style={[
                          styles.compactGridItem,
                          { backgroundColor: colors.surface },
                        ]}
                      >
                        <Image
                          source={{ uri: meal.image }}
                          style={styles.compactGridItemImage}
                        />
                        <Text
                          style={[
                            styles.compactGridItemName,
                            { color: colors.textPrimary },
                          ]}
                          numberOfLines={1}
                        >
                          {meal.name}
                        </Text>
                        <Text
                          style={[
                            styles.compactGridItemQty,
                            { color: colors.textSecondary },
                          ]}
                        >
                          ×{meal.quantity}
                        </Text>
                        {buildMealMeta(meal) ? (
                          <Text
                            style={[
                              styles.compactGridItemMeta,
                              { color: colors.textSecondary },
                            ]}
                            numberOfLines={2}
                          >
                            {buildMealMeta(meal)}
                          </Text>
                        ) : null}
                      </View>
                    ))}
                  </View>

                  {/* Quick Actions */}
                  <View
                    style={[
                      styles.compactActions,
                      { borderTopColor: colors.border },
                    ]}
                  >
                    <TouchableOpacity
                      style={styles.compactActionButton}
                      onPress={() => {
                        setSelectedOrder(order);
                        setShowTrackingModal(true);
                      }}
                    >
                      <Ionicons
                        name="location-outline"
                        size={16}
                        color={colors.primary}
                      />
                      <Text
                        style={[
                          styles.compactActionText,
                          { color: colors.primary },
                        ]}
                      >
                        Track
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.compactActionButton}
                      onPress={() => {
                        setSelectedOrder(order);
                        setShowReceiptModal(true);
                      }}
                    >
                      <Ionicons
                        name="receipt-outline"
                        size={16}
                        color={colors.primary}
                      />
                      <Text
                        style={[
                          styles.compactActionText,
                          { color: colors.primary },
                        ]}
                      >
                        Receipt
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* Upcoming deliveries section hidden for future updates */}
        {/* 
                <View style={styles.upcomingBody}>
                  <Text style={styles.upcomingRestaurant}>
                    {delivery.restaurant}
                  </Text>
                  <Text style={styles.upcomingSchedule}>
                    {delivery.schedule}
                  </Text>
                  <View style={styles.upcomingLocationRow}>
                    <Ionicons
                      name="location-outline"
                      size={14}
                      color={colors.textSecondary}
                    />
                    <Text style={styles.upcomingLocation}>
                      {delivery.deliveryAddress || "UPSA Campus, Accra"}
                    </Text>
                  </View>
                  <Text style={styles.upcomingItems}>{delivery.items}</Text>
                </View>
                <View style={styles.upcomingMeta}>
                  <Text style={styles.upcomingTotal}>
                    GH₵{delivery.total?.toFixed(2)}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>
      )}
      */}
      </ScrollView>

      {/* Receipt Modal */}
      <Modal
        visible={showReceiptModal && !!selectedOrder}
        transparent
        animationType="slide"
        onRequestClose={() => setShowReceiptModal(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setShowReceiptModal(false)}
          />
          {selectedOrder ? (
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Receipt</Text>
                <TouchableOpacity onPress={() => setShowReceiptModal(false)}>
                  <Ionicons
                    name="close"
                    size={24}
                    color={colors.textSecondary}
                  />
                </TouchableOpacity>
              </View>

              <ScrollView
                style={styles.receiptContent}
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.receiptLogoContainer}>
                  <Image
                    source={require("../../assets/chawp.png")}
                    style={styles.receiptLogoImage}
                  />
                  <Text style={styles.receiptSubtitle}>
                    Food Delivery Receipt
                  </Text>
                </View>

                <View style={styles.receiptDivider} />

                <View style={styles.receiptInfoRow}>
                  <Text style={styles.receiptInfoLabel}>Order ID</Text>
                  <Text style={styles.receiptInfoValue}>
                    {selectedOrder.id?.substring(0, 8).toUpperCase() || "N/A"}
                  </Text>
                </View>
                <View style={styles.receiptInfoRow}>
                  <Text style={styles.receiptInfoLabel}>Status</Text>
                  <Text style={styles.receiptInfoValue}>
                    {formatStatus(selectedOrder.status)}
                  </Text>
                </View>
                <View style={styles.receiptInfoRow}>
                  <Text style={styles.receiptInfoLabel}>Date</Text>
                  <Text style={styles.receiptInfoValue}>
                    {new Date(selectedOrder.createdAt).toLocaleDateString()}
                  </Text>
                </View>

                <View style={styles.receiptDivider} />

                <View style={styles.receiptRestaurantSection}>
                  <Text style={styles.receiptRestaurantName}>
                    {selectedOrder.restaurant}
                  </Text>
                </View>

                <View style={styles.receiptItemsHeader}>
                  <Text style={styles.receiptItemsHeaderCol1}>Item</Text>
                  <Text style={styles.receiptItemsHeaderCol2}>Qty</Text>
                  <Text style={styles.receiptItemsHeaderCol3}>Price</Text>
                </View>
                <View style={styles.receiptDivider} />

                {selectedOrder.meals?.map((meal, index) => (
                  <View key={index} style={styles.receiptItemBlock}>
                    <View style={styles.receiptItemRow}>
                      <Text style={styles.receiptItemCol1}>{meal.name}</Text>
                      <Text style={styles.receiptItemCol2}>
                        {meal.quantity}
                      </Text>
                      <Text style={styles.receiptItemCol3}>
                        GH₵{(meal.price * meal.quantity).toFixed(2)}
                      </Text>
                    </View>
                    {buildMealMeta(meal) ? (
                      <Text style={styles.receiptItemMeta}>
                        {buildMealMeta(meal)}
                      </Text>
                    ) : null}
                  </View>
                ))}

                <View style={styles.receiptDivider} />

                <View style={styles.receiptCalculation}>
                  <View style={styles.receiptCalcRow}>
                    <Text style={styles.receiptCalcLabel}>Subtotal</Text>
                    <Text style={styles.receiptCalcValue}>
                      GH₵
                      {(
                        selectedOrder.meals?.reduce(
                          (sum, meal) => sum + meal.price * meal.quantity,
                          0,
                        ) || 0
                      ).toFixed(2)}
                    </Text>
                  </View>
                </View>

                <View style={styles.receiptTotalSection}>
                  <Text style={styles.receiptTotalLabel}>Order Total</Text>
                  <Text style={styles.receiptTotalAmount}>
                    GH₵{selectedOrder.total?.toFixed(2)}
                  </Text>
                  <Text style={styles.receiptTotalNote}>
                    Service fee and delivery charges applied at checkout
                  </Text>
                </View>

                <View style={styles.receiptAddressSection}>
                  <Text style={styles.receiptAddressLabel}>
                    Delivery Address
                  </Text>
                  <Text style={styles.receiptAddressText}>
                    {selectedOrder.deliveryAddress || "UPSA Campus, Accra"}
                  </Text>
                </View>
              </ScrollView>
            </View>
          ) : null}
        </View>
      </Modal>

      {/* Tracking Modal */}
      <Modal
        visible={showTrackingModal && !!selectedOrder}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTrackingModal(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setShowTrackingModal(false)}
          />
          {selectedOrder ? (
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Track Order</Text>
                <TouchableOpacity onPress={() => setShowTrackingModal(false)}>
                  <Ionicons
                    name="close"
                    size={24}
                    color={colors.textSecondary}
                  />
                </TouchableOpacity>
              </View>

              <ScrollView
                style={styles.trackingContent}
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.trackingRestaurant}>
                  <Image
                    source={{ uri: selectedOrder.vendorImage }}
                    style={styles.trackingVendorImage}
                  />
                  <View>
                    <Text style={styles.trackingRestaurantName}>
                      {selectedOrder.restaurant}
                    </Text>
                    <View
                      style={[
                        styles.statusBadge,
                        getStatusColor(selectedOrder.status, colors),
                      ]}
                    >
                      <Text style={styles.statusText}>
                        {formatStatus(selectedOrder.status)}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.timeline}>
                  <View style={styles.timelineStep}>
                    <View
                      style={[styles.timelineIcon, styles.timelineIconDone]}
                    >
                      <Ionicons
                        name="checkmark"
                        size={16}
                        color={colors.card}
                      />
                    </View>
                    <View style={styles.timelineContent}>
                      <Text style={styles.timelineLabel}>Order Confirmed</Text>
                      <Text style={styles.timelineTime}>Completed</Text>
                    </View>
                  </View>

                  <View style={styles.timelineStep}>
                    <View
                      style={[
                        styles.timelineIcon,
                        selectedOrder.status === "pending"
                          ? styles.timelineIconActive
                          : styles.timelineIconDone,
                      ]}
                    >
                      {selectedOrder.status === "pending" ? (
                        <View style={styles.timelineProgress} />
                      ) : (
                        <Ionicons
                          name="checkmark"
                          size={16}
                          color={colors.card}
                        />
                      )}
                    </View>
                    <View style={styles.timelineContent}>
                      <Text style={styles.timelineLabel}>Being Prepared</Text>
                      <Text style={styles.timelineTime}>
                        {selectedOrder.status === "pending"
                          ? "In progress"
                          : "Completed"}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.timelineStep}>
                    <View
                      style={[
                        styles.timelineIcon,
                        selectedOrder.status === "out_for_delivery"
                          ? styles.timelineIconActive
                          : selectedOrder.status === "delivered"
                            ? styles.timelineIconDone
                            : styles.timelineIconPending,
                      ]}
                    >
                      {selectedOrder.status === "out_for_delivery" ? (
                        <View style={styles.timelineProgress} />
                      ) : selectedOrder.status === "delivered" ? (
                        <Ionicons
                          name="checkmark"
                          size={16}
                          color={colors.card}
                        />
                      ) : (
                        <View style={styles.timelineEmptyIcon} />
                      )}
                    </View>
                    <View style={styles.timelineContent}>
                      <Text style={styles.timelineLabel}>Out for Delivery</Text>
                      <Text style={styles.timelineTime}>
                        {selectedOrder.status === "out_for_delivery"
                          ? "In progress"
                          : selectedOrder.status === "delivered"
                            ? "Completed"
                            : "Pending"}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.timelineStep}>
                    <View
                      style={[
                        styles.timelineIcon,
                        selectedOrder.status === "delivered"
                          ? styles.timelineIconDone
                          : styles.timelineIconPending,
                      ]}
                    >
                      {selectedOrder.status === "delivered" ? (
                        <Ionicons
                          name="checkmark"
                          size={16}
                          color={colors.card}
                        />
                      ) : (
                        <View style={styles.timelineEmptyIcon} />
                      )}
                    </View>
                    <View style={styles.timelineContent}>
                      <Text style={styles.timelineLabel}>Delivered</Text>
                      <Text style={styles.timelineTime}>
                        {selectedOrder.status === "delivered"
                          ? "Completed"
                          : "Pending"}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.etaSection}>
                  <Ionicons
                    name="timer-outline"
                    size={24}
                    color={colors.primary}
                  />
                  <View>
                    <Text style={styles.etaLabel}>Estimated Delivery</Text>
                    <Text style={styles.etaTime}>{selectedOrder.eta}</Text>
                  </View>
                </View>
              </ScrollView>
            </View>
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

function SectionHeader({ title, actionLabel, colors, styles }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {actionLabel && (
        <TouchableOpacity style={styles.sectionAction}>
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
}

const createStyles = (colors) => {
  const staticColors = colors;
  return StyleSheet.create({
    pageContainer: {
      flex: 1,
      backgroundColor: staticColors.background,
    },
    container: {
      flex: 1,
      backgroundColor: staticColors.background,
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
    title: {
      ...typography.headline,
      color: staticColors.textPrimary,
    },
    headerButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
    },
    headerButtonText: {
      color: staticColors.textSecondary,
      fontWeight: "600",
    },
    statsContainer: {
      flexDirection: "row",
      gap: spacing.md,
    },
    statCard: {
      flex: 1,
      flexDirection: "column",
      alignItems: "center",
      backgroundColor: staticColors.card,
      borderRadius: radii.lg,
      borderWidth: 2,
      borderColor: staticColors.accent,
      padding: spacing.lg,
      gap: spacing.md,
      shadowColor: staticColors.accent,
      shadowOpacity: 0.2,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 4,
    },
    statIconWrapper: {
      width: 48,
      height: 48,
      borderRadius: radii.md,
      backgroundColor: staticColors.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    statContent: {
      flex: 1,
      gap: spacing.xs / 2,
    },
    statValue: {
      textAlign: "center",
      ...typography.headline,
      color: staticColors.textPrimary,
      fontSize: 24,
      fontWeight: "700",
    },
    statLabel: {
      color: staticColors.textSecondary,
      fontSize: 12,
      textAlign: "center",
      fontWeight: "400",
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    activeOrdersList: {
      gap: spacing.md,
      marginBottom: spacing.lg,
    },
    activeOrderCard: {
      backgroundColor: staticColors.card,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: staticColors.border,
      overflow: "hidden",
    },
    activeOrderHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      padding: spacing.lg,
      paddingBottom: spacing.md,
    },
    vendorInfo: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      flex: 1,
    },
    vendorImage: {
      width: 60,
      height: 60,
      borderRadius: radii.md,
      backgroundColor: staticColors.surface,
    },
    activeRestaurantName: {
      ...typography.headline,
      color: staticColors.textPrimary,
      marginBottom: spacing.xs,
    },
    statusRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    statusBadge: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
      borderRadius: radii.sm,
      borderWidth: 1,
    },
    statusText: {
      fontSize: 11,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.5,
      color: staticColors.textPrimary,
    },
    etaBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    etaText: {
      color: staticColors.accent,
      fontSize: 12,
      fontWeight: "600",
    },
    mealsContainer: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.md,
      gap: spacing.sm,
    },
    mealItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingVertical: spacing.xs,
    },
    mealImage: {
      width: 50,
      height: 50,
      borderRadius: radii.sm,
      backgroundColor: staticColors.surface,
    },
    mealInfo: {
      flex: 1,
    },
    mealName: {
      ...typography.body,
      color: staticColors.textPrimary,
      fontWeight: "600",
      marginBottom: 2,
    },
    mealQuantity: {
      fontSize: 13,
      color: staticColors.textSecondary,
    },
    mealPrice: {
      ...typography.body,
      color: staticColors.textPrimary,
      fontWeight: "700",
    },
    moreItemsText: {
      fontSize: 13,
      color: staticColors.textSecondary,
      fontStyle: "italic",
      textAlign: "center",
      paddingVertical: spacing.xs,
    },
    activeOrderFooter: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.lg,
      borderTopWidth: 1,
      borderTopColor: staticColors.border,
      gap: spacing.sm,
    },
    deliveryAddressRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
    },
    deliveryAddress: {
      flex: 1,
      fontSize: 13,
      color: staticColors.textSecondary,
    },
    totalRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingTop: spacing.xs,
    },
    totalLabel: {
      ...typography.headline,
      color: staticColors.textSecondary,
    },
    totalAmount: {
      ...typography.title,
      color: staticColors.primary,
      fontSize: 24,
    },
    // Compact card styles
    compactCardHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      padding: spacing.md,
      paddingBottom: spacing.sm,
    },
    compactHeaderLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      flex: 1,
    },
    compactVendorImage: {
      width: 45,
      height: 45,
      borderRadius: radii.md,
      backgroundColor: staticColors.surface,
    },
    compactVendorInfo: {
      flex: 1,
    },
    compactRestaurantName: {
      ...typography.body,
      color: staticColors.textPrimary,
      fontWeight: "600",
      fontSize: 14,
      marginBottom: 2,
    },
    compactOrderId: {
      fontSize: 11,
      color: staticColors.textSecondary,
      marginBottom: 4,
    },
    compactStatusRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
    },
    compactTotal: {
      alignItems: "flex-end",
    },
    compactTotalAmount: {
      ...typography.body,
      color: staticColors.primary,
      fontWeight: "700",
      fontSize: 16,
    },
    compactItemsGrid: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
      justifyContent: "flex-start",
    },
    compactGridItem: {
      width: "23%",
      alignItems: "center",
      gap: spacing.xs,
    },
    compactGridItemImage: {
      width: "100%",
      height: 60,
      borderRadius: radii.sm,
      backgroundColor: staticColors.surface,
    },
    compactGridItemName: {
      fontSize: 11,
      color: staticColors.textSecondary,
      textAlign: "center",
    },
    compactGridItemQty: {
      fontSize: 10,
      color: staticColors.textMuted,
      fontWeight: "600",
    },
    compactGridItemMeta: {
      fontSize: 9,
      color: staticColors.textMuted,
      textAlign: "center",
    },
    compactItemsSummary: {
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.sm,
    },
    compactItemText: {
      fontSize: 12,
      color: staticColors.textSecondary,
      marginBottom: 2,
    },
    compactMoreItems: {
      fontSize: 11,
      color: staticColors.textMuted,
      fontStyle: "italic",
    },
    compactActions: {
      flexDirection: "row",
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: spacing.md,
      gap: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: staticColors.border,
    },
    compactActionButton: {
      flex: 1,
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      gap: spacing.xs,
      paddingVertical: spacing.sm,
      borderRadius: radii.md,
      backgroundColor: staticColors.surface,
    },
    compactActionText: {
      fontSize: 12,
      color: staticColors.primary,
      fontWeight: "600",
    },
    viewReceiptButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.xs,
      paddingVertical: spacing.sm,
    },
    viewReceiptText: {
      color: staticColors.primary,
      fontSize: 14,
      fontWeight: "600",
    },
    sectionHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    sectionTitle: {
      ...typography.title,
      color: staticColors.textPrimary,
    },
    sectionAction: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
    },
    sectionActionText: {
      color: staticColors.textSecondary,
      fontWeight: "600",
    },
    upcomingList: {
      gap: spacing.md,
    },
    upcomingCard: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: staticColors.surface,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: staticColors.border,
      padding: spacing.md,
      gap: spacing.md,
    },
    upcomingImage: {
      width: 70,
      height: 70,
      borderRadius: radii.md,
    },
    upcomingBody: {
      flex: 1,
      gap: spacing.xs,
    },
    upcomingRestaurant: {
      ...typography.body,
      color: staticColors.textPrimary,
      fontWeight: "600",
    },
    upcomingSchedule: {
      color: staticColors.textSecondary,
    },
    upcomingItems: {
      color: staticColors.textMuted,
      fontSize: 12,
    },
    upcomingLocationRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      marginTop: 2,
    },
    upcomingLocation: {
      fontSize: 13,
      color: staticColors.textSecondary,
    },
    upcomingMeta: {
      alignItems: "flex-end",
      gap: spacing.xs,
    },
    upcomingTotal: {
      color: staticColors.textPrimary,
      fontWeight: "700",
    },
    upcomingLink: {
      color: staticColors.accent,
      fontSize: 13,
      fontWeight: "600",
    },
    loadingText: {
      color: staticColors.textSecondary,
      textAlign: "center",
      paddingVertical: spacing.lg,
    },
    emptyText: {
      color: staticColors.textMuted,
      textAlign: "center",
      paddingVertical: spacing.xl,
      fontSize: 14,
    },
    historyDivider: {
      height: 1,
      backgroundColor: staticColors.border,
      marginVertical: spacing.sm,
    },
    historyCard: {
      backgroundColor: staticColors.card,
      borderRadius: radii.md,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    historyHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: spacing.md,
    },
    historyRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    historyLeft: {
      flex: 1,
    },
    historyRestaurant: {
      ...typography.body,
      color: staticColors.textPrimary,
      fontWeight: "600",
    },
    historyDate: {
      color: staticColors.textSecondary,
      fontSize: 13,
      marginTop: spacing.xs / 2,
    },
    historyMealsContainer: {
      marginBottom: spacing.md,
    },
    historyMealItem: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: spacing.xs,
      borderBottomWidth: 1,
      borderBottomColor: staticColors.border + "40",
    },
    historyMealImage: {
      width: 40,
      height: 40,
      borderRadius: radii.sm,
      marginRight: spacing.sm,
    },
    historyMealInfo: {
      flex: 1,
    },
    historyMealName: {
      color: staticColors.textPrimary,
      fontSize: 14,
      fontWeight: "500",
    },
    historyMealQuantity: {
      color: staticColors.textSecondary,
      fontSize: 12,
      marginTop: 2,
    },
    historyMealMeta: {
      color: staticColors.textMuted,
      fontSize: 11,
      marginTop: 2,
    },
    historyMealPrice: {
      color: staticColors.accent,
      fontSize: 14,
      fontWeight: "600",
    },
    historyLocationRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      marginTop: spacing.xs,
    },
    historyLocation: {
      fontSize: 12,
      color: staticColors.textMuted,
    },
    historyMeta: {
      alignItems: "flex-end",
      gap: spacing.xs,
    },
    historyTotal: {
      color: staticColors.textPrimary,
      fontWeight: "700",
      fontSize: 16,
    },
    ratingRow: {
      flexDirection: "row",
      gap: spacing.xs / 2,
    },
    loadingContainer: {
      paddingVertical: spacing.xl * 2,
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.md,
    },
    loadingText: {
      color: staticColors.textSecondary,
      fontSize: 14,
      fontWeight: "500",
    },
    // Modal Styles
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0, 0, 0, 0.6)",
      justifyContent: "flex-end",
    },
    modalBackdrop: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    },
    modalCard: {
      backgroundColor: staticColors.card,
      borderTopLeftRadius: radii.lg,
      borderTopRightRadius: radii.lg,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      paddingBottom: spacing.xl,
      maxHeight: "85%",
      overflow: "hidden",
    },
    modalHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: spacing.md,
    },
    modalTitle: {
      ...typography.title,
      color: staticColors.textPrimary,
    },
    receiptContent: {
      maxHeight: 520,
    },
    receiptLogoContainer: {
      alignItems: "center",
      marginBottom: spacing.md,
    },
    receiptLogoImage: {
      width: 50,
      height: 50,
      borderRadius: 25,
      resizeMode: "contain",
      marginBottom: spacing.xs / 2,
    },
    receiptLogo: {
      fontSize: 28,
      fontWeight: "700",
      color: staticColors.primary,
      marginBottom: spacing.xs / 2,
    },
    receiptSubtitle: {
      fontSize: 12,
      color: staticColors.textSecondary,
      fontWeight: "500",
    },
    receiptDivider: {
      height: 1,
      backgroundColor: staticColors.border,
      marginVertical: spacing.sm,
    },
    receiptInfoRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: spacing.xs / 2,
    },
    receiptInfoLabel: {
      fontSize: 12,
      color: staticColors.textSecondary,
      fontWeight: "600",
    },
    receiptInfoValue: {
      fontSize: 12,
      color: staticColors.textPrimary,
      fontWeight: "500",
    },
    receiptRestaurantSection: {
      alignItems: "center",
      marginVertical: spacing.sm,
    },
    receiptRestaurantName: {
      fontSize: 15,
      fontWeight: "700",
      color: staticColors.textPrimary,
    },
    receiptItemsHeader: {
      flexDirection: "row",
      paddingVertical: spacing.xs / 2,
    },
    receiptItemsHeaderCol1: {
      flex: 1,
      fontSize: 10,
      fontWeight: "700",
      color: staticColors.textPrimary,
      textTransform: "uppercase",
    },
    receiptItemsHeaderCol2: {
      width: 35,
      fontSize: 10,
      fontWeight: "700",
      color: staticColors.textPrimary,
      textTransform: "uppercase",
    },
    receiptItemsHeaderCol3: {
      width: 65,
      fontSize: 10,
      fontWeight: "700",
      color: staticColors.textPrimary,
      textAlign: "right",
      textTransform: "uppercase",
    },
    receiptItemRow: {
      flexDirection: "row",
      paddingVertical: spacing.xs / 2,
    },
    receiptItemBlock: {
      paddingVertical: spacing.xs / 2,
    },
    receiptItemCol1: {
      flex: 1,
      fontSize: 12,
      color: staticColors.textPrimary,
    },
    receiptItemCol2: {
      width: 35,
      fontSize: 12,
      color: staticColors.textSecondary,
      textAlign: "center",
    },
    receiptItemCol3: {
      width: 65,
      fontSize: 12,
      color: staticColors.textPrimary,
      fontWeight: "600",
      textAlign: "right",
    },
    receiptItemMeta: {
      fontSize: 10,
      color: staticColors.textSecondary,
      marginTop: 2,
      marginLeft: 2,
    },
    receiptCalculation: {
      marginVertical: spacing.sm,
    },
    receiptCalcRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: spacing.xs / 2,
    },
    receiptCalcLabel: {
      fontSize: 11,
      color: staticColors.textSecondary,
      fontWeight: "500",
    },
    receiptCalcValue: {
      fontSize: 11,
      color: staticColors.textPrimary,
      fontWeight: "600",
    },
    receiptTotalSection: {
      backgroundColor: staticColors.surface,
      borderRadius: radii.md,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      alignItems: "center",
      marginVertical: spacing.md,
    },
    receiptTotalLabel: {
      fontSize: 11,
      color: staticColors.textSecondary,
      fontWeight: "600",
      textTransform: "uppercase",
      marginBottom: spacing.xs / 2,
    },
    receiptTotalAmount: {
      fontSize: 24,
      fontWeight: "700",
      color: staticColors.primary,
    },
    receiptTotalNote: {
      fontSize: 9,
      color: staticColors.textMuted,
      marginTop: spacing.xs,
      fontStyle: "italic",
      textAlign: "center",
    },
    receiptAddressSection: {
      marginVertical: spacing.sm,
    },
    receiptAddressLabel: {
      fontSize: 10,
      fontWeight: "700",
      color: staticColors.textSecondary,
      textTransform: "uppercase",
      marginBottom: spacing.xs / 2,
    },
    receiptAddressText: {
      fontSize: 12,
      color: staticColors.textPrimary,
      lineHeight: 16,
    },
    trackingContent: {
      maxHeight: 520,
    },
    trackingRestaurant: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingBottom: spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: staticColors.border,
      marginBottom: spacing.lg,
    },
    trackingVendorImage: {
      width: 60,
      height: 60,
      borderRadius: radii.md,
    },
    trackingRestaurantName: {
      ...typography.body,
      color: staticColors.textPrimary,
      fontWeight: "600",
      marginBottom: spacing.xs,
    },
    timeline: {
      paddingVertical: spacing.lg,
    },
    timelineStep: {
      flexDirection: "row",
      marginBottom: spacing.lg,
      alignItems: "flex-start",
    },
    timelineStepActive: {
      opacity: 1,
    },
    timelineIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      marginRight: spacing.md,
      marginTop: 2,
    },
    timelineIconDone: {
      backgroundColor: staticColors.primary,
    },
    timelineIconActive: {
      backgroundColor: staticColors.primary + "22",
      borderWidth: 1,
      borderColor: staticColors.primary,
    },
    timelineIconPending: {
      backgroundColor: staticColors.surface,
      borderWidth: 1,
      borderColor: staticColors.border,
    },
    timelineProgress: {
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: staticColors.primary,
    },
    timelineEmptyIcon: {
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: staticColors.border,
    },
    timelineContent: {
      flex: 1,
      paddingTop: spacing.xs,
    },
    timelineLabel: {
      color: staticColors.textPrimary,
      fontWeight: "600",
      fontSize: 14,
      marginBottom: spacing.xs / 2,
    },
    timelineTime: {
      color: staticColors.textSecondary,
      fontSize: 12,
    },
    etaSection: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      backgroundColor: staticColors.surface,
      padding: spacing.lg,
      borderRadius: radii.lg,
      marginTop: spacing.lg,
      marginBottom: spacing.xs,
    },
    etaLabel: {
      color: staticColors.textSecondary,
      fontSize: 12,
      marginBottom: spacing.xs / 2,
    },
    etaTime: {
      color: staticColors.textPrimary,
      fontWeight: "700",
      fontSize: 16,
    },
  });
};
