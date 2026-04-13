import React, { useMemo } from "react";
import {
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { spacing, radii, typography } from "../theme";
import EmptyState from "../components/EmptyState";
import LoadingPlaceholder from "../components/LoadingPlaceholder";
import PaystackModal from "../components/PaystackModal";
import { fetchOrderHistory, subscribeToOrderHistory } from "../services/api";
import { useDataFetching } from "../hooks/useDataFetching";
import { useTheme } from "../contexts/ThemeContext";
import { useAuth } from "../contexts/AuthContext";
import { useNotification } from "../contexts/NotificationContext";
import {
  generatePaymentReference,
  getPaystackPublicKey,
  initializePaystackPaymentForOrders,
  verifyPaymentForOrders,
} from "../services/paystack";

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

export default function OrderHistoryPage({ onBack }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { user, profile } = useAuth();
  const notification = useNotification();

  const [refreshing, setRefreshing] = React.useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = React.useState(false);
  const [showPaymentModal, setShowPaymentModal] = React.useState(false);
  const [paymentReference, setPaymentReference] = React.useState("");
  const [paymentAccessCode, setPaymentAccessCode] = React.useState("");
  const [paymentOrderIds, setPaymentOrderIds] = React.useState([]);
  const [paymentAmount, setPaymentAmount] = React.useState(0);

  const {
    data: orderHistoryData,
    loading: historyLoading,
    refresh: refreshOrderHistory,
    setData: setOrderHistoryData,
  } = useDataFetching(() => fetchOrderHistory(1, 50), [], "order-history");

  React.useEffect(() => {
    const unsubscribeOrderHistory = subscribeToOrderHistory(
      (updatedHistory) => {
        setOrderHistoryData(updatedHistory);
      },
    );

    return () => {
      unsubscribeOrderHistory();
    };
  }, [setOrderHistoryData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshOrderHistory();
    setRefreshing(false);
  };

  const startPayNow = async (order) => {
    try {
      if (!user) {
        notification.error(
          "Authentication Required",
          "Please sign in to continue.",
        );
        return;
      }

      const orderIds = [order.id];
      const reference = generatePaymentReference();

      setIsProcessingPayment(true);
      setPaymentOrderIds(orderIds);
      setPaymentReference(reference);
      setPaymentAmount(Number(order.total) || 0);

      const initResult = await initializePaystackPaymentForOrders({
        reference,
        orderIds,
      });

      if (!initResult?.accessCode) {
        throw new Error("Payment initialization did not return an access code");
      }

      setPaymentReference(initResult.reference || reference);
      setPaymentAccessCode(initResult.accessCode);
      setShowPaymentModal(true);
    } catch (error) {
      console.error("Pay-now init error:", error);
      notification.error(
        "Payment Failed",
        error.message || "Could not start payment. Please try again.",
      );
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const handlePaymentSuccess = async (response) => {
    try {
      setShowPaymentModal(false);
      setPaymentAccessCode("");
      setIsProcessingPayment(true);

      const reference = response?.transactionRef?.reference || paymentReference;
      await verifyPaymentForOrders(reference, paymentOrderIds);

      notification.success(
        "Payment Successful",
        "Your payment has been confirmed.",
      );

      await refreshOrderHistory();
    } catch (error) {
      console.error("Pay-now verify error:", error);
      notification.error(
        "Verification Failed",
        error.message || "Could not verify payment. Please contact support.",
      );
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const handlePaymentCancel = () => {
    setShowPaymentModal(false);
    setPaymentAccessCode("");
    notification.warning("Payment Cancelled", "Your payment was not completed");
  };

  const orderHistoryItems = orderHistoryData?.items || [];

  return (
    <View style={styles.pageContainer}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Order History</Text>
        <View style={styles.headerSpacer} />
      </View>

      {historyLoading ? (
        <View style={styles.loadingContainer}>
          <LoadingPlaceholder width={96} height={12} borderRadius={8} />
          <Text style={styles.loadingText}>Loading order history...</Text>
        </View>
      ) : (
        <>
          <FlatList
            data={orderHistoryItems}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.primary}
                colors={[colors.primary]}
              />
            }
            ItemSeparatorComponent={() => (
              <View style={styles.historyDivider} />
            )}
            ListEmptyComponent={() => (
              <View style={styles.emptyWrap}>
                <EmptyState
                  icon="receipt-outline"
                  title="No order history"
                  message="Your delivered orders will appear here"
                />
              </View>
            )}
            renderItem={({ item }) => {
              const isUnpaid = String(item.paymentStatus || "paid") !== "paid";

              return (
                <View style={styles.historyCard}>
                  <View style={styles.historyHeader}>
                    <View style={styles.historyLeft}>
                      <Text style={styles.historyRestaurant}>
                        {item.restaurant}
                      </Text>
                      <Text style={styles.historyDate}>{item.date}</Text>
                    </View>
                    <View style={styles.historyMeta}>
                      <Text style={styles.historyTotal}>
                        GH₵{Number(item.total || 0).toFixed(2)}
                      </Text>
                      <View style={styles.ratingRow}>
                        {Array.from({ length: 5 }).map((_, index) => (
                          <Ionicons
                            key={`${item.id}-star-${index}`}
                            name={
                              index < (item.rating || 0)
                                ? "star"
                                : "star-outline"
                            }
                            size={16}
                            color={colors.accent}
                          />
                        ))}
                      </View>
                    </View>
                  </View>

                  {isUnpaid ? (
                    <View style={styles.paymentStatusRow}>
                      <Ionicons
                        name="alert-circle-outline"
                        size={14}
                        color={colors.textSecondary}
                      />
                      <Text style={styles.paymentStatusText}>Unpaid</Text>
                    </View>
                  ) : null}

                  {item.meals && item.meals.length > 0 && (
                    <View style={styles.historyMealsContainer}>
                      {item.meals.slice(0, 3).map((meal, index) => (
                        <View key={index} style={styles.historyMealItem}>
                          <Image
                            source={{ uri: meal.image }}
                            style={styles.historyMealImage}
                          />
                          <View style={styles.historyMealInfo}>
                            <Text
                              style={styles.historyMealName}
                              numberOfLines={1}
                            >
                              {meal.name}
                            </Text>
                            <Text style={styles.historyMealQuantity}>
                              Qty: {meal.quantity}
                            </Text>
                            {buildMealMeta(meal) ? (
                              <Text
                                style={styles.historyMealMeta}
                                numberOfLines={2}
                              >
                                {buildMealMeta(meal)}
                              </Text>
                            ) : null}
                          </View>
                          <Text style={styles.historyMealPrice}>
                            GH₵{(meal.price * meal.quantity).toFixed(2)}
                          </Text>
                        </View>
                      ))}
                      {item.meals.length > 3 && (
                        <Text style={styles.moreItemsText}>
                          +{item.meals.length - 3} more item(s)
                        </Text>
                      )}
                    </View>
                  )}

                  <View style={styles.historyLocationRow}>
                    <Ionicons
                      name="location-outline"
                      size={12}
                      color={colors.textMuted}
                    />
                    <Text style={styles.historyLocation}>
                      {item.deliveryAddress || "UPSA Campus, Accra"}
                    </Text>
                  </View>

                  {isUnpaid ? (
                    <TouchableOpacity
                      style={styles.payNowButton}
                      onPress={() => startPayNow(item)}
                      disabled={isProcessingPayment}
                    >
                      {isProcessingPayment ? (
                        <LoadingPlaceholder
                          width={72}
                          height={10}
                          borderRadius={8}
                        />
                      ) : (
                        <Text style={styles.payNowButtonText}>Pay now</Text>
                      )}
                    </TouchableOpacity>
                  ) : null}
                </View>
              );
            }}
          />

          <PaystackModal
            visible={showPaymentModal}
            paystackKey={getPaystackPublicKey()}
            email={user?.email || profile?.email || ""}
            amount={Number(paymentAmount || 0)}
            reference={paymentReference}
            accessCode={paymentAccessCode}
            onSuccess={handlePaymentSuccess}
            onCancel={handlePaymentCancel}
            metadata={{
              mode: "pay_after_delivery",
              order_ids: paymentOrderIds,
            }}
          />
        </>
      )}
    </View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    pageContainer: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingTop: spacing.xl,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.md,
    },
    backButton: {
      width: 38,
      height: 38,
      borderRadius: radii.md,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    title: {
      ...typography.headline,
      color: colors.textPrimary,
    },
    headerSpacer: {
      width: 38,
      height: 38,
    },
    listContent: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.xl,
    },
    loadingContainer: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.md,
    },
    loadingText: {
      color: colors.textSecondary,
      fontSize: 14,
      fontWeight: "500",
    },
    emptyWrap: {
      marginTop: spacing.xl,
    },
    historyDivider: {
      height: 1,
      backgroundColor: colors.border,
      marginVertical: spacing.sm,
    },
    historyCard: {
      backgroundColor: colors.card,
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
    historyLeft: {
      flex: 1,
    },
    historyRestaurant: {
      ...typography.body,
      color: colors.textPrimary,
      fontWeight: "600",
    },
    historyDate: {
      color: colors.textSecondary,
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
      borderBottomColor: colors.border + "40",
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
      color: colors.textPrimary,
      fontSize: 14,
      fontWeight: "500",
    },
    historyMealQuantity: {
      color: colors.textSecondary,
      fontSize: 12,
      marginTop: 2,
    },
    historyMealMeta: {
      color: colors.textMuted,
      fontSize: 11,
      marginTop: 2,
    },
    historyMealPrice: {
      color: colors.accent,
      fontSize: 14,
      fontWeight: "600",
    },
    moreItemsText: {
      fontSize: 13,
      color: colors.textSecondary,
      fontStyle: "italic",
      textAlign: "center",
      paddingVertical: spacing.xs,
    },
    historyLocationRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      marginTop: spacing.xs,
    },
    historyLocation: {
      fontSize: 12,
      color: colors.textMuted,
    },
    paymentStatusRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: spacing.xs,
    },
    paymentStatusText: {
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: "600",
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    payNowButton: {
      marginTop: spacing.md,
      backgroundColor: colors.primary,
      borderRadius: radii.md,
      paddingVertical: spacing.sm,
      alignItems: "center",
      justifyContent: "center",
    },
    payNowButtonText: {
      color: colors.card,
      fontSize: 14,
      fontWeight: "700",
    },
    historyMeta: {
      alignItems: "flex-end",
      gap: spacing.xs,
    },
    historyTotal: {
      color: colors.textPrimary,
      fontWeight: "700",
      fontSize: 16,
    },
    ratingRow: {
      flexDirection: "row",
      gap: spacing.xs / 2,
    },
  });
