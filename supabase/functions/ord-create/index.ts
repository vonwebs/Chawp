// Supabase Edge Function: ord-create (create unpaid order(s) for pay-after-delivery)
// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const EXPO_PUSH_TOKEN_REGEX = /^(ExponentPushToken|ExpoPushToken)\[/;

const filterFcmTokens = (tokens: unknown[]) =>
  [...new Set((tokens || []).filter(Boolean))].filter(
    (token) =>
      typeof token === "string" && !EXPO_PUSH_TOKEN_REGEX.test(String(token)),
  );

const roundCurrency = (value: number) => Math.round(value * 100) / 100;

const computeServiceFeeAmount = (
  subtotal: number,
  mode: string,
  flatAmount: number,
  percentageAmount: number,
) => {
  if (!Number.isFinite(subtotal) || subtotal <= 0) return 0;

  if (mode === "percentage") {
    if (!Number.isFinite(percentageAmount) || percentageAmount <= 0) return 0;
    return roundCurrency((subtotal * percentageAmount) / 100);
  }

  if (!Number.isFinite(flatAmount) || flatAmount <= 0) return 0;
  return roundCurrency(flatAmount);
};

const normalizeSize = (size: unknown): string | null => {
  if (typeof size !== "string") return null;
  const normalized = size.trim().toLowerCase();
  return normalized || null;
};

const normalizeSpecifications = (specifications: unknown) => {
  if (!Array.isArray(specifications)) return [];

  return [
    ...new Set(
      specifications.map((spec) => String(spec || "").trim()).filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
};

const parseObjectLike = (value: unknown): Record<string, unknown> | null => {
  if (!value) return null;

  if (typeof value === "string") {
    const raw = value.trim();
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }

    return null;
  }

  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return null;
};

const toPositiveMoney = (value: unknown): number => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Number(amount.toFixed(2));
};

const extractLegacyOptionPriceMap = (
  options: unknown,
  normalizeKey: (key: string) => string | null,
): Record<string, number> => {
  if (!Array.isArray(options)) return {};

  const map: Record<string, number> = {};
  for (const option of options) {
    if (!option || typeof option !== "object") continue;

    const label =
      (option as any).value ??
      (option as any).name ??
      (option as any).label ??
      (option as any).size ??
      (option as any).spec;
    const key = normalizeKey(String(label || "").trim());
    if (!key) continue;

    const amount = toPositiveMoney(
      (option as any).extra_price ??
        (option as any).extraPrice ??
        (option as any).price_adjustment ??
        (option as any).price,
    );

    if (amount > 0) {
      map[key] = amount;
    }
  }

  return map;
};

const normalizePriceAdjustments = (
  priceMap: unknown,
  normalizeKey: (key: string) => string | null,
): Record<string, number> => {
  const normalizedSource = parseObjectLike(priceMap);
  if (!normalizedSource) {
    return {};
  }

  const normalized: Record<string, number> = {};
  for (const [key, rawValue] of Object.entries(normalizedSource)) {
    const normalizedKey = normalizeKey(String(key || "").trim());
    const value = toPositiveMoney(rawValue);
    if (!normalizedKey || value <= 0) continue;
    normalized[normalizedKey] = value;
  }

  return normalized;
};

const getMealPricingDetails = (
  meal: any,
  selectedSize: unknown,
  selectedSpecifications: unknown,
) => {
  const basePrice = Number(meal?.price || 0);
  const normalizedBasePrice = Number.isFinite(basePrice) ? basePrice : 0;

  const sizePriceMap = normalizePriceAdjustments(meal?.size_prices, (key) =>
    normalizeSize(key),
  );
  const specificationPriceMap = normalizePriceAdjustments(
    meal?.specification_prices,
    (key) => key.trim().toLowerCase() || null,
  );

  const mergedSizePriceMap = {
    ...extractLegacyOptionPriceMap(meal?.sizes, (key) => normalizeSize(key)),
    ...sizePriceMap,
  };
  const mergedSpecificationPriceMap = {
    ...extractLegacyOptionPriceMap(
      meal?.specifications,
      (key) => key.trim().toLowerCase() || null,
    ),
    ...specificationPriceMap,
  };

  const normalizedSize = normalizeSize(selectedSize);
  const normalizedSpecs = normalizeSpecifications(selectedSpecifications);

  const sizeAdjustment = normalizedSize
    ? Number(mergedSizePriceMap[normalizedSize] || 0)
    : 0;
  const specificationAdjustment = normalizedSpecs.reduce(
    (sum, specification) =>
      sum +
      Number(
        mergedSpecificationPriceMap[
          String(specification).trim().toLowerCase()
        ] || 0,
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
};

const formatSizeLabel = (size: unknown) => {
  const normalized = String(size || "")
    .trim()
    .toLowerCase();
  if (!normalized) return null;

  return normalized
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

const buildOrderItemInstructions = (item: any) => {
  const selectedSpecifications = normalizeSpecifications(
    item?.selected_specifications,
  );
  const customerNote = String(item?.special_instructions || "").trim();

  const lines: string[] = [];
  const selectedSize = formatSizeLabel(item?.selected_size);

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
};

const allocateFeeAcrossGroups = (
  totalFee: number,
  vendorGroups: Array<{ vendorId: string; subtotal: number }>,
) => {
  const totalSubtotal = vendorGroups.reduce(
    (sum, group) => sum + group.subtotal,
    0,
  );
  if (!Number.isFinite(totalFee) || totalFee <= 0 || totalSubtotal <= 0) {
    return new Map(vendorGroups.map((g) => [g.vendorId, 0]));
  }

  const shares = new Map<string, number>();
  let allocated = 0;

  vendorGroups.forEach((group, index) => {
    if (index === vendorGroups.length - 1) {
      const remainder = roundCurrency(totalFee - allocated);
      shares.set(group.vendorId, remainder);
      return;
    }

    const raw = (totalFee * group.subtotal) / totalSubtotal;
    const share = roundCurrency(raw);
    allocated = roundCurrency(allocated + share);
    shares.set(group.vendorId, share);
  });

  return shares;
};

const getPaystackKeyMode = (secretKey: string | undefined): string => {
  const key = String(secretKey || "")
    .trim()
    .toLowerCase();
  if (key.startsWith("sk_test_")) return "test";
  if (key.startsWith("sk_live_")) return "live";
  return "unknown";
};

const getSubaccountVerificationStatus = (sub: any): string => {
  if (!sub || typeof sub !== "object") return "unknown";

  const status = String(
    sub.verification_status ||
      sub.account_verification_status ||
      sub.subaccount_status ||
      "",
  )
    .trim()
    .toLowerCase();

  if (status) return status;

  if (typeof sub.is_verified === "boolean") {
    return sub.is_verified ? "verified" : "unverified";
  }

  if (typeof sub.verified === "boolean") {
    return sub.verified ? "verified" : "unverified";
  }

  return "unknown";
};

const isSubaccountVerified = (sub: any): boolean => {
  if (!sub || typeof sub !== "object") return false;
  if (sub.is_verified === true || sub.verified === true) return true;

  const verificationStatus = getSubaccountVerificationStatus(sub);
  return ["verified", "approved", "success"].includes(verificationStatus);
};

const isSubaccountMissingResponse = (
  statusCode: number,
  payload: Record<string, any> | null,
): boolean => {
  const message = String(payload?.message || payload?.error || "")
    .trim()
    .toLowerCase();

  if (statusCode === 404) return true;

  return (
    message.includes("not found") ||
    message.includes("does not exist") ||
    message.includes("invalid subaccount")
  );
};

const pickDeliveryAssignee = (
  candidates: any[],
  activeOrderCounts: Record<string, number>,
) => {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;

  const ranked = [...candidates].sort((a, b) => {
    const loadA = Number(activeOrderCounts[a.id] || 0);
    const loadB = Number(activeOrderCounts[b.id] || 0);
    if (loadA !== loadB) return loadA - loadB;

    const ratingA = Number(a.rating || 0);
    const ratingB = Number(b.rating || 0);
    if (ratingA !== ratingB) return ratingB - ratingA;

    return (
      Number(b.completed_deliveries || 0) - Number(a.completed_deliveries || 0)
    );
  });

  return ranked[0] || null;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const paystackSecretKey = Deno.env.get("PAYSTACK_SECRET_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!paystackSecretKey) {
      throw new Error("Paystack secret key not configured");
    }

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Supabase environment is not configured correctly");
    }

    const paystackKeyMode = getPaystackKeyMode(paystackSecretKey);

    const authHeader = req.headers.get("Authorization") ?? "";

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    const writeClient = supabaseServiceRoleKey
      ? createClient(supabaseUrl, supabaseServiceRoleKey)
      : userClient;

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      throw new Error("Authentication required");
    }

    const { orderData } = await req.json();

    const { data: userProfile, error: profileError } = await userClient
      .from("chawp_user_profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (profileError || !userProfile) {
      throw new Error("User profile not found");
    }

    const { data: settingsRows, error: settingsError } = await userClient
      .from("chawp_app_settings")
      .select(
        "service_fee, delivery_fee, service_fee_mode, service_fee_percentage, pay_after_delivery_enabled",
      )
      .limit(1);

    if (settingsError) {
      throw new Error(`Failed to fetch app settings: ${settingsError.message}`);
    }

    if (!settingsRows || settingsRows.length === 0) {
      throw new Error("No app settings found");
    }

    const settings = settingsRows[0];
    if (!Boolean(settings.pay_after_delivery_enabled)) {
      throw new Error("Pay after delivery is currently disabled");
    }

    const baseServiceFee = Number(settings.service_fee);
    const baseDeliveryFee = Number(settings.delivery_fee);
    const serviceFeeMode =
      String(settings.service_fee_mode || "flat")
        .trim()
        .toLowerCase() === "percentage"
        ? "percentage"
        : "flat";
    const serviceFeePercentage = Number(settings.service_fee_percentage);

    const { data: cartItems, error: cartError } = await userClient
      .from("chawp_cart_items")
      .select(
        `
        *,
        meal:chawp_meals(
          *,
          vendor:chawp_vendors(*)
        )
      `,
      )
      .eq("user_id", user.id);

    if (cartError || !cartItems || cartItems.length === 0) {
      throw new Error("Cart is empty");
    }

    const { data: deliveryCandidatesData, error: deliveryCandidatesError } =
      await writeClient
        .from("chawp_delivery_personnel")
        .select(
          "id, rating, completed_deliveries, is_available, is_verified, is_active, deleted_at, payment_account, account_verified",
        )
        .eq("is_available", true)
        .eq("is_verified", true)
        .is("deleted_at", null)
        .or("is_active.is.null,is_active.eq.true");

    if (deliveryCandidatesError) {
      throw new Error(
        deliveryCandidatesError.message ||
          "Failed to fetch available delivery personnel",
      );
    }

    const deliveryCandidates = (deliveryCandidatesData || []).filter(
      (candidate: any) => String(candidate?.payment_account || "").trim(),
    );

    if (deliveryCandidates.length === 0) {
      throw new Error(
        "No available delivery personnel with verified payout accounts",
      );
    }

    const deliveryCandidateIds = deliveryCandidates.map((candidate: any) =>
      String(candidate.id || "").trim(),
    );

    const { data: deliveryBankDetailsData, error: deliveryBankDetailsError } =
      await writeClient
        .from("chawp_delivery_bank_details")
        .select("delivery_personnel_id, is_verified")
        .in("delivery_personnel_id", deliveryCandidateIds);

    if (deliveryBankDetailsError) {
      throw new Error(
        deliveryBankDetailsError.message ||
          "Failed to evaluate delivery payout verification",
      );
    }

    const bankVerifiedByDeliveryId = new Map<string, boolean>();
    for (const row of deliveryBankDetailsData || []) {
      const deliveryId = String(row?.delivery_personnel_id || "").trim();
      if (!deliveryId) continue;
      bankVerifiedByDeliveryId.set(deliveryId, Boolean(row?.is_verified));
    }

    const eligibleDeliveryCandidates: any[] = [];

    for (const candidate of deliveryCandidates as any[]) {
      const deliveryId = String(candidate?.id || "").trim();
      const subaccountCode = String(candidate?.payment_account || "").trim();
      if (!deliveryId || !subaccountCode) continue;

      const localApproved =
        Boolean(candidate?.account_verified) ||
        Boolean(bankVerifiedByDeliveryId.get(deliveryId));

      const detailsRes = await fetch(
        `https://api.paystack.co/subaccount/${encodeURIComponent(subaccountCode)}`,
        { headers: { Authorization: `Bearer ${paystackSecretKey}` } },
      );

      const detailsJson = await detailsRes.json();

      if (!detailsRes.ok || detailsJson.status !== true) {
        if (isSubaccountMissingResponse(detailsRes.status, detailsJson)) {
          continue;
        }
        throw new Error(
          detailsJson?.message || "Failed to verify delivery subaccount",
        );
      }

      const subaccount = detailsJson?.data || {};
      const paystackVerified = isSubaccountVerified(subaccount);

      const payoutApproved =
        paystackKeyMode === "test"
          ? localApproved || paystackVerified
          : localApproved && paystackVerified;

      if (!payoutApproved) {
        continue;
      }

      const canonicalSubaccountCode = String(
        subaccount?.subaccount_code || subaccountCode,
      ).trim();

      eligibleDeliveryCandidates.push({
        ...candidate,
        payment_account: canonicalSubaccountCode || subaccountCode,
      });

      if (paystackVerified && !Boolean(candidate?.account_verified)) {
        await writeClient
          .from("chawp_delivery_personnel")
          .update({ account_verified: true })
          .eq("id", deliveryId);
      }
    }

    if (eligibleDeliveryCandidates.length === 0) {
      throw new Error(
        "No available delivery personnel with verified payout accounts",
      );
    }

    const { data: activeDeliveryOrders, error: activeDeliveryOrdersError } =
      await writeClient
        .from("chawp_orders")
        .select("delivery_personnel_id")
        .in("status", [
          "pending",
          "confirmed",
          "preparing",
          "ready",
          "out_for_delivery",
        ])
        .not("delivery_personnel_id", "is", null);

    if (activeDeliveryOrdersError) {
      throw new Error(
        activeDeliveryOrdersError.message ||
          "Failed to evaluate delivery assignment load",
      );
    }

    const activeOrderCounts: Record<string, number> = {};
    for (const order of activeDeliveryOrders || []) {
      const deliveryId = String(order?.delivery_personnel_id || "").trim();
      if (!deliveryId) continue;
      activeOrderCounts[deliveryId] =
        Number(activeOrderCounts[deliveryId] || 0) + 1;
    }

    const assignedDelivery = pickDeliveryAssignee(
      eligibleDeliveryCandidates,
      activeOrderCounts,
    );

    if (!assignedDelivery) {
      throw new Error("Unable to assign delivery personnel for this order");
    }

    const vendorGroups: Record<
      string,
      {
        vendorId: string;
        items: any[];
        subtotal: number;
      }
    > = {};

    let itemsSubtotal = 0;

    for (const item of cartItems as any[]) {
      const vendorId = String(item?.meal?.vendor?.id || "").trim();

      if (!vendorId) {
        throw new Error(`Item ${item.meal_id} has no vendor ID`);
      }

      if (!vendorGroups[vendorId]) {
        vendorGroups[vendorId] = {
          vendorId,
          items: [],
          subtotal: 0,
        };
      }

      const pricing = getMealPricingDetails(
        item.meal,
        item.selected_size,
        item.selected_specifications,
      );

      const itemTotal =
        Number(item.quantity || 0) * Number(pricing.unitPrice || 0);

      vendorGroups[vendorId].items.push({
        meal_id: item.meal_id,
        quantity: item.quantity,
        unit_price: pricing.unitPrice,
        selected_size: item.selected_size || null,
        selected_specifications: normalizeSpecifications(
          item.selected_specifications,
        ),
        meal_image:
          String(item?.meal?.image || "").trim() ||
          (Array.isArray(item?.meal?.images)
            ? String(item.meal.images[0] || "").trim() || null
            : null),
        special_instructions: buildOrderItemInstructions(item),
      });

      vendorGroups[vendorId].subtotal += itemTotal;
      itemsSubtotal += itemTotal;
    }

    itemsSubtotal = roundCurrency(itemsSubtotal);

    const serviceFee = computeServiceFeeAmount(
      itemsSubtotal,
      serviceFeeMode,
      baseServiceFee,
      serviceFeePercentage,
    );

    const deliveryFee = roundCurrency(
      Number.isFinite(baseDeliveryFee) ? baseDeliveryFee : 0,
    );

    const groups = Object.values(vendorGroups).map((g) => ({
      vendorId: g.vendorId,
      subtotal: roundCurrency(g.subtotal),
    }));

    const serviceFeeByVendor = allocateFeeAcrossGroups(serviceFee, groups);
    const deliveryFeeByVendor = allocateFeeAcrossGroups(deliveryFee, groups);

    const assignedDeliveryPersonnelId =
      String(assignedDelivery?.id || "").trim() || null;

    const createdOrders: any[] = [];

    for (const group of Object.values(vendorGroups)) {
      const groupSubtotal = roundCurrency(group.subtotal);
      const orderServiceFee = roundCurrency(
        Number(serviceFeeByVendor.get(group.vendorId) || 0),
      );
      const orderDeliveryFee = roundCurrency(
        Number(deliveryFeeByVendor.get(group.vendorId) || 0),
      );

      const orderInsertData: any = {
        user_id: userProfile.id,
        vendor_id: group.vendorId,
        total_amount: groupSubtotal,
        service_fee: orderServiceFee,
        delivery_fee: orderDeliveryFee,
        delivery_address:
          orderData?.deliveryAddress || userProfile.address || "UPSA Campus",
        delivery_instructions: orderData?.deliveryInstructions || "",
        payment_method: "pay_after_delivery",
        payment_status: "pending",
        status: "pending",
      };

      if (assignedDeliveryPersonnelId) {
        orderInsertData.delivery_personnel_id = assignedDeliveryPersonnelId;
      }

      if (orderData?.deliveryLocation) {
        orderInsertData.delivery_location = orderData.deliveryLocation;
      }

      if (orderData?.scheduledFor) {
        orderInsertData.scheduled_for = orderData.scheduledFor;
      }

      const insertPayload: any = { ...orderInsertData };
      const optionalOrderColumns = ["delivery_location", "scheduled_for"];

      let { data: order, error: orderError } = await writeClient
        .from("chawp_orders")
        .insert(insertPayload)
        .select()
        .single();

      while (orderError) {
        const errorMessage = String(orderError.message || "");
        const missingColumn = optionalOrderColumns.find(
          (column) =>
            errorMessage.includes(`'${column}'`) &&
            Object.prototype.hasOwnProperty.call(insertPayload, column),
        );

        if (!missingColumn) {
          break;
        }

        // Allow older databases to proceed even when optional columns are absent.
        delete insertPayload[missingColumn];

        const retryResult = await writeClient
          .from("chawp_orders")
          .insert(insertPayload)
          .select()
          .single();

        order = retryResult.data;
        orderError = retryResult.error;
      }

      if (orderError) {
        throw new Error(orderError.message || "Failed to create order");
      }

      const orderItems = group.items.map((orderItem) => ({
        order_id: order.id,
        ...orderItem,
      }));

      const { error: itemsError } = await writeClient
        .from("chawp_order_items")
        .insert(orderItems);

      if (itemsError) {
        throw new Error(itemsError.message || "Failed to create order items");
      }

      // Create vendor payout ledger entry immediately (pending) for admin settlement workflow.
      const { error: payoutCreateError } = await writeClient
        .from("chawp_vendor_payouts")
        .insert({
          vendor_id: group.vendorId,
          amount: roundCurrency(groupSubtotal),
          status: "pending",
          payment_method: "pay_after_delivery",
          reference_number: null,
          notes: `Pay-after-delivery order ${order.id} awaiting customer payment`,
        });

      if (payoutCreateError) {
        throw new Error(
          payoutCreateError.message || "Failed to create pending vendor payout",
        );
      }

      createdOrders.push(order);

      // Notify vendor about new order.
      try {
        const { data: vendor, error: vendorError } = await writeClient
          .from("chawp_vendors")
          .select("name, user_id")
          .eq("id", group.vendorId)
          .single();

        if (vendorError) {
          throw new Error(
            vendorError.message || "Failed to fetch vendor for notification",
          );
        }

        const vendorUserId = String(vendor?.user_id || "").trim();
        const { data: vendorProfile, error: vendorProfileError } = vendorUserId
          ? await writeClient
              .from("chawp_user_profiles")
              .select("push_token")
              .eq("id", vendorUserId)
              .maybeSingle()
          : { data: null as any, error: null as any };

        if (vendorProfileError) {
          throw new Error(
            vendorProfileError.message ||
              "Failed to fetch vendor push profile token",
          );
        }

        const { data: vendorDeviceTokens, error: vendorDeviceTokensError } =
          vendorUserId
            ? await writeClient
                .from("chawp_device_tokens")
                .select("push_token")
                .eq("user_id", vendorUserId)
                .in("device_type", ["vendor", "vendor_app"])
            : { data: [] as any[], error: null as any };

        if (vendorDeviceTokensError) {
          throw new Error(
            vendorDeviceTokensError.message ||
              "Failed to fetch vendor device tokens",
          );
        }

        const vendorTokens = [
          vendorProfile?.push_token,
          ...((vendorDeviceTokens || []).map((row: any) => row.push_token) ||
            []),
        ].filter(Boolean);

        const uniqueVendorTokens = [...new Set(vendorTokens)];

        if (uniqueVendorTokens.length > 0) {
          const customerName =
            userProfile.username || userProfile.full_name || "Customer";
          const itemsCount = group.items.length;
          const itemsText = itemsCount === 1 ? "item" : "items";

          await userClient.functions.invoke("send-push-notification", {
            body: {
              tokens: uniqueVendorTokens,
              title: "🔔 New Order Received",
              body: `New pay-after-delivery order from ${customerName} with ${itemsCount} ${itemsText}. Total: GH₵${groupSubtotal.toFixed(2)}`,
              data: {
                orderId: order.id,
                type: "new_order",
                channelId: "orders",
              },
            },
          });
        }
      } catch (notifError) {
        console.error(
          `Failed to send vendor notification for order ${order?.id} and vendor ${group.vendorId}:`,
          notifError,
        );
      }
    }

    // Notify admins about new order(s).
    try {
      const { data: admins } = await writeClient
        .from("chawp_user_profiles")
        .select("id, push_token, role")
        .in("role", ["admin", "super_admin"]);

      if (admins && admins.length > 0) {
        const adminIds = admins.map((admin) => admin.id);

        const { data: deviceTokens } = await writeClient
          .from("chawp_device_tokens")
          .select("push_token")
          .in("user_id", adminIds)
          .eq("device_type", "admin");

        const profileTokens = admins
          .map((admin) => admin.push_token)
          .filter(Boolean);
        const deviceAppTokens =
          deviceTokens?.map((token) => token.push_token).filter(Boolean) || [];
        const allTokens = [...new Set([...profileTokens, ...deviceAppTokens])];

        if (allTokens.length > 0) {
          const customerName =
            userProfile.username || userProfile.full_name || "Customer";
          const totalAmount = roundCurrency(
            itemsSubtotal + serviceFee + deliveryFee,
          );

          await userClient.functions.invoke("send-push-notification", {
            body: {
              tokens: allTokens,
              title: "📦 New Order Placed",
              body: `${customerName} placed a pay-after-delivery order worth GH₵${totalAmount.toFixed(2)}`,
              data: {
                orderId: createdOrders[0]?.id,
                type: "new_order_admin",
                channelId: "admin-alerts",
              },
            },
          });
        }
      }
    } catch (_notifError) {
      // Ignore admin notification errors.
    }

    // Notify assigned delivery personnel about new assignment.
    if (assignedDeliveryPersonnelId && createdOrders.length > 0) {
      try {
        const { data: deliveryPerson } = await writeClient
          .from("chawp_delivery_personnel")
          .select("user_id")
          .eq("id", assignedDeliveryPersonnelId)
          .maybeSingle();

        const deliveryUserId = String(deliveryPerson?.user_id || "").trim();
        if (deliveryUserId) {
          const { data: deliveryTokens } = await writeClient
            .from("chawp_device_tokens")
            .select("push_token")
            .eq("user_id", deliveryUserId)
            .eq("device_type", "delivery");

          const uniqueTokens = [
            ...new Set(
              (deliveryTokens || [])
                .map((row: any) => row.push_token)
                .filter(Boolean),
            ),
          ];

          if (uniqueTokens.length > 0) {
            await userClient.functions.invoke("send-push-notification", {
              body: {
                tokens: uniqueTokens,
                title: "🚚 New Delivery Assignment",
                body: `You've been assigned ${createdOrders.length} new order${createdOrders.length > 1 ? "s" : ""}.`,
                data: {
                  orderId: createdOrders[0]?.id,
                  type: "delivery_assigned",
                  channelId: "orders",
                },
              },
            });
          }
        }
      } catch (_deliveryNotifError) {
        // Ignore delivery notification errors.
      }
    }

    const { error: clearCartError } = await writeClient
      .from("chawp_cart_items")
      .delete()
      .eq("user_id", user.id);

    if (clearCartError) {
      console.error("Failed to clear cart:", clearCartError);
    }

    // Notify customer that order placement completed successfully.
    try {
      const { data: customerProfileTokenRow } = await writeClient
        .from("chawp_user_profiles")
        .select("push_token")
        .eq("id", user.id)
        .maybeSingle();

      const { data: customerDeviceTokens, error: customerDeviceTokensError } =
        await writeClient
          .from("chawp_device_tokens")
          .select("push_token")
          .eq("user_id", user.id)
          .eq("device_type", "customer");

      if (customerDeviceTokensError) {
        throw new Error(
          customerDeviceTokensError.message ||
            "Failed to fetch customer device tokens",
        );
      }

      const customerTokens = filterFcmTokens([
        customerProfileTokenRow?.push_token,
        ...((customerDeviceTokens || []).map((row: any) => row.push_token) ||
          []),
      ]);

      if (customerTokens.length > 0) {
        const totalAmount = roundCurrency(itemsSubtotal + serviceFee + deliveryFee);
        const orderCount = createdOrders.length;

        await userClient.functions.invoke("send-push-notification", {
          body: {
            tokens: customerTokens,
            title: "Order Placed Successfully",
            body: `Your order${orderCount > 1 ? "s" : ""} ${orderCount > 1 ? "have" : "has"} been placed. Total: GH₵${totalAmount.toFixed(2)}.`,
            data: {
              orderId: createdOrders[0]?.id,
              type: "order_placed",
              channelId: "orders",
            },
          },
        });
      }
    } catch (customerNotifError) {
      console.error("Failed to send customer order notification:", customerNotifError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        orders: createdOrders,
        fees: {
          itemsSubtotal,
          serviceFee,
          deliveryFee,
          totalAmount: roundCurrency(itemsSubtotal + serviceFee + deliveryFee),
        },
        message: "Order created (payment due after delivery)",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error) {
    console.error("ord-create error:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error?.message || "An unknown error occurred",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      },
    );
  }
});
