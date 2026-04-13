// Supabase Edge Function to verify Paystack payment and create orders
// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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

    const { reference, orderData } = await req.json();

    if (!reference) {
      throw new Error("Payment reference is required");
    }

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

    const { data: userProfile, error: profileError } = await userClient
      .from("chawp_user_profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (profileError || !userProfile) {
      throw new Error("User profile not found");
    }

    const paystackResponse = await fetch(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${paystackSecretKey}`,
          "Content-Type": "application/json",
        },
      },
    );

    const paystackData = await paystackResponse.json();

    if (!paystackResponse.ok || paystackData.status !== true) {
      throw new Error(
        paystackData.message || "Payment verification failed with Paystack",
      );
    }

    const paymentInfo = paystackData.data;

    if (paymentInfo.status !== "success") {
      throw new Error(`Payment status is ${paymentInfo.status}`);
    }

    let ledgerEnabled = true;
    let existingPayment: any = null;

    try {
      const { data, error } = await writeClient
        .from("chawp_payments")
        .select("*")
        .eq("reference", reference)
        .maybeSingle();

      if (error) {
        throw error;
      }

      existingPayment = data;
    } catch (paymentLookupError: any) {
      const errorText = String(
        paymentLookupError?.message || paymentLookupError || "",
      ).toLowerCase();

      if (
        errorText.includes("chawp_payments") &&
        (errorText.includes("does not exist") ||
          errorText.includes("relation") ||
          errorText.includes("schema cache"))
      ) {
        ledgerEnabled = false;
        console.warn(
          "chawp_payments table unavailable. Continuing without ledger idempotency.",
        );
      } else {
        throw paymentLookupError;
      }
    }

    if (ledgerEnabled && existingPayment?.status === "paid") {
      const recordedOrderIds = Array.isArray(
        existingPayment?.metadata?.order_ids,
      )
        ? existingPayment.metadata.order_ids
        : [];

      let existingOrders: any[] = [];
      if (recordedOrderIds.length > 0) {
        const { data: ordersById } = await writeClient
          .from("chawp_orders")
          .select("*")
          .in("id", recordedOrderIds);

        existingOrders = ordersById || [];
      } else {
        const { data: ordersByReference } = await writeClient
          .from("chawp_orders")
          .select("*")
          .eq("payment_reference", reference)
          .eq("user_id", user.id);

        existingOrders = ordersByReference || [];
      }

      return new Response(
        JSON.stringify({
          success: true,
          orders: existingOrders,
          totalAmount: existingPayment.total_amount,
          paymentReference: reference,
          idempotent: true,
          message: "Payment already processed for this reference",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    const mergedOrderData = {
      ...(existingPayment?.metadata?.order_data || {}),
      ...(orderData || {}),
    };

    const assignedDeliveryPersonnelId =
      String(mergedOrderData?.deliveryPersonnelId || "").trim() || null;

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

    const { data: appSettings, error: settingsError } = await userClient
      .from("chawp_app_settings")
      .select(
        "service_fee, delivery_fee, service_fee_mode, service_fee_percentage",
      )
      .limit(1);

    if (settingsError) {
      throw new Error(`Failed to fetch app settings: ${settingsError.message}`);
    }

    if (!appSettings || appSettings.length === 0) {
      throw new Error("No app settings found in chawp_app_settings table");
    }

    const baseServiceFee = Number(appSettings[0].service_fee);
    const deliveryFee = Number(appSettings[0].delivery_fee);
    const serviceFeeMode =
      String(appSettings[0].service_fee_mode || "flat")
        .trim()
        .toLowerCase() === "percentage"
        ? "percentage"
        : "flat";
    const serviceFeePercentage = Number(appSettings[0].service_fee_percentage);

    if (!Number.isFinite(baseServiceFee) || !Number.isFinite(deliveryFee)) {
      throw new Error("Invalid service_fee or delivery_fee in app settings");
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

    const expectedTotal = roundCurrency(
      itemsSubtotal + serviceFee + deliveryFee,
    );
    const paidAmount = Number(paymentInfo.amount || 0) / 100;

    if (Math.abs(paidAmount - expectedTotal) > 0.01) {
      throw new Error(
        `Amount mismatch. Expected ${expectedTotal}, got ${paidAmount}`,
      );
    }

    if (ledgerEnabled) {
      const interimPayload = {
        reference,
        user_id: user.id,
        payment_provider: "paystack",
        currency: String(paymentInfo.currency || "GHS").toUpperCase(),
        status: "processing",
        split_mode: existingPayment?.split_mode || "none",
        split_code: existingPayment?.split_code || null,
        subaccounts: existingPayment?.subaccounts || [],
        items_subtotal: itemsSubtotal,
        service_fee: serviceFee,
        delivery_fee: deliveryFee,
        total_amount: expectedTotal,
        paystack_transaction_id:
          paymentInfo.id != null ? Number(paymentInfo.id) : null,
        paystack_response: paymentInfo,
        metadata: {
          ...(existingPayment?.metadata || {}),
          order_data: mergedOrderData,
          verify_started_at: new Date().toISOString(),
        },
      };

      const { error: interimError } = await writeClient
        .from("chawp_payments")
        .upsert(interimPayload, { onConflict: "reference" });

      if (interimError) {
        console.error(
          "Failed to upsert processing payment state:",
          interimError,
        );
      }
    }

    const orders: any[] = [];

    for (const group of Object.values(vendorGroups)) {
      const orderInsertData: any = {
        user_id: userProfile.id,
        vendor_id: group.vendorId,
        total_amount: roundCurrency(group.subtotal),
        delivery_address:
          mergedOrderData?.deliveryAddress ||
          userProfile.address ||
          "UPSA Campus",
        delivery_instructions: mergedOrderData?.deliveryInstructions || "",
        payment_method: "paystack",
        payment_reference: reference,
        payment_status: "paid",
        status: "pending",
        delivery_fee: roundCurrency(deliveryFee),
      };

      if (assignedDeliveryPersonnelId) {
        orderInsertData.delivery_personnel_id = assignedDeliveryPersonnelId;
      }

      if (mergedOrderData?.scheduledFor) {
        orderInsertData.scheduled_for = mergedOrderData.scheduledFor;
      }

      const { data: order, error: orderError } = await writeClient
        .from("chawp_orders")
        .insert(orderInsertData)
        .select()
        .single();

      if (orderError) {
        throw new Error(orderError.message || "Failed to create order");
      }

      const orderItems = group.items.map((item) => ({
        order_id: order.id,
        ...item,
      }));

      const { error: itemsError } = await writeClient
        .from("chawp_order_items")
        .insert(orderItems);

      if (itemsError) {
        throw new Error(itemsError.message || "Failed to create order items");
      }

      orders.push(order);

      const { error: vendorPayoutError } = await writeClient
        .from("chawp_vendor_payouts")
        .insert({
          vendor_id: group.vendorId,
          amount: roundCurrency(group.subtotal),
          status: "completed",
          payment_method: "paystack_split",
          reference_number: reference,
          notes: `Auto-settled from payment ${reference}`,
          completed_at: new Date().toISOString(),
        });

      if (vendorPayoutError) {
        console.error(
          "Failed to create automatic vendor payout:",
          vendorPayoutError,
        );
      }

      try {
        const { data: vendor } = await userClient
          .from("chawp_vendors")
          .select("name, chawp_user_profiles(push_token, username)")
          .eq("id", group.vendorId)
          .single();

        if (vendor?.chawp_user_profiles?.push_token) {
          const customerName =
            userProfile.username || userProfile.full_name || "Customer";
          const itemsCount = group.items.length;
          const itemsText = itemsCount === 1 ? "item" : "items";

          await userClient.functions.invoke("send-push-notification", {
            body: {
              tokens: [vendor.chawp_user_profiles.push_token],
              title: "🔔 New Order Received",
              body: `New order from ${customerName} with ${itemsCount} ${itemsText}. Total: GH₵${group.subtotal.toFixed(2)}`,
              data: {
                orderId: order.id,
                type: "new_order",
                channelId: "orders",
              },
            },
          });
        }
      } catch (notifError) {
        console.error("Failed to send vendor notification:", notifError);
      }
    }

    try {
      const { data: admins } = await userClient
        .from("chawp_user_profiles")
        .select("id, push_token, username, role")
        .in("role", ["admin", "super_admin"]);

      if (admins && admins.length > 0) {
        const adminIds = admins.map((admin) => admin.id);

        const { data: deviceTokens } = await userClient
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

          await userClient.functions.invoke("send-push-notification", {
            body: {
              tokens: allTokens,
              title: "📦 New Order Placed",
              body: `${customerName} placed an order worth GH₵${expectedTotal.toFixed(2)}`,
              data: {
                orderId: orders[0]?.id,
                type: "new_order_admin",
                channelId: "admin-alerts",
              },
            },
          });
        }
      }
    } catch (notifError) {
      console.error("Failed to send admin notification:", notifError);
    }

    if (assignedDeliveryPersonnelId && orders.length > 0) {
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
                .map((row) => row.push_token)
                .filter(Boolean),
            ),
          ];

          if (uniqueTokens.length > 0) {
            await userClient.functions.invoke("send-push-notification", {
              body: {
                tokens: uniqueTokens,
                title: "🚚 New Delivery Assignment",
                body: `You've been assigned ${orders.length} new order${orders.length > 1 ? "s" : ""}.`,
                data: {
                  orderId: orders[0]?.id,
                  type: "delivery_assigned",
                  channelId: "orders",
                },
              },
            });
          }
        }
      } catch (deliveryNotifError) {
        console.error(
          "Failed to send delivery assignment notification:",
          deliveryNotifError,
        );
      }
    }

    if (assignedDeliveryPersonnelId && deliveryFee > 0) {
      const { error: deliveryEarningError } = await writeClient
        .from("chawp_delivery_earnings")
        .insert({
          delivery_personnel_id: assignedDeliveryPersonnelId,
          order_id: orders[0]?.id || null,
          amount: roundCurrency(deliveryFee),
          type: "delivery_fee",
          description: `Auto-settled delivery fee from payment ${reference}`,
          status: "paid",
          payment_method: "paystack_split",
          reference_number: reference,
          earned_at: new Date().toISOString(),
          paid_at: new Date().toISOString(),
        });

      if (deliveryEarningError) {
        console.error(
          "Failed to create automatic delivery earning:",
          deliveryEarningError,
        );
      }
    }

    if (ledgerEnabled) {
      const { error: finalizeError } = await writeClient
        .from("chawp_payments")
        .update({
          status: "paid",
          paid_at: new Date().toISOString(),
          paystack_transaction_id:
            paymentInfo.id != null ? Number(paymentInfo.id) : null,
          paystack_response: paymentInfo,
          metadata: {
            ...(existingPayment?.metadata || {}),
            order_ids: orders.map((order) => order.id),
            order_count: orders.length,
            order_data: mergedOrderData,
            verify_completed_at: new Date().toISOString(),
          },
        })
        .eq("reference", reference);

      if (finalizeError) {
        console.error("Failed to finalize payment ledger:", finalizeError);
      }
    }

    const { error: clearCartError } = await writeClient
      .from("chawp_cart_items")
      .delete()
      .eq("user_id", user.id);

    if (clearCartError) {
      console.error("Failed to clear cart:", clearCartError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        orders,
        totalAmount: expectedTotal,
        paymentReference: reference,
        message: "Payment verified and order created successfully",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error) {
    console.error("verify-payment error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error?.message || "An error occurred",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      },
    );
  }
});
