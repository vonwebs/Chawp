// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type VendorGroup = {
  vendorId: string;
  subaccount: string;
  subtotal: number;
  itemCount: number;
};

type DeliveryCandidate = {
  id: string;
  rating: number;
  completed_deliveries: number;
  payment_account: string;
  account_verified?: boolean;
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

const normalizeSpecifications = (specifications: unknown): string[] => {
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
  candidates: DeliveryCandidate[],
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
    const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!PAYSTACK_SECRET_KEY)
      throw new Error("PAYSTACK_SECRET_KEY not configured");
    if (!SUPABASE_URL) throw new Error("SUPABASE_URL not configured");
    if (!SUPABASE_ANON_KEY) throw new Error("SUPABASE_ANON_KEY not configured");
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY not configured");
    }

    const body = await req.json();
    const reference = String(body?.reference || "").trim();
    const orderData = body?.orderData || {};

    if (!reference) {
      throw new Error("reference is required");
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: { Authorization: req.headers.get("Authorization") ?? "" },
      },
    });

    const writeClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      throw new Error("Authentication required");
    }

    const { data: profile } = await userClient
      .from("chawp_user_profiles")
      .select("id, email")
      .eq("id", user.id)
      .maybeSingle();

    const customerEmail = String(user.email || profile?.email || "").trim();
    if (!customerEmail) {
      throw new Error("Customer email is required");
    }

    const { data: existingPayment } = await writeClient
      .from("chawp_payments")
      .select("reference, status, split_code, paystack_response, metadata")
      .eq("reference", reference)
      .maybeSingle();

    if (existingPayment?.status === "initialized") {
      const authorizationUrl =
        existingPayment.paystack_response?.authorization_url;
      const accessCode = existingPayment.paystack_response?.access_code;
      if (authorizationUrl && accessCode) {
        return new Response(
          JSON.stringify({
            success: true,
            reference,
            authorizationUrl,
            accessCode,
            reused: true,
            message: "Existing initialized payment reused",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          },
        );
      }
    }

    const { data: cartItems, error: cartError } = await userClient
      .from("chawp_cart_items")
      .select(
        `
        id,
        meal_id,
        quantity,
        selected_size,
        selected_specifications,
        special_instructions,
        meal:chawp_meals(
          id,
          title,
          image,
          images,
          price,
          sizes,
          specifications,
          size_prices,
          specification_prices,
          vendor:chawp_vendors(id, payment_account, account_verified, deleted_at)
        )
      `,
      )
      .eq("user_id", user.id);

    if (cartError) {
      throw new Error(cartError.message || "Failed to fetch cart");
    }

    if (!cartItems || cartItems.length === 0) {
      throw new Error("Cart is empty");
    }

    const { data: settingsRows, error: settingsError } = await userClient
      .from("chawp_app_settings")
      .select(
        "service_fee, delivery_fee, service_fee_mode, service_fee_percentage",
      )
      .limit(1);

    if (settingsError) {
      throw new Error(settingsError.message || "Failed to fetch app settings");
    }

    if (!settingsRows || settingsRows.length === 0) {
      throw new Error("No app settings found");
    }

    const baseServiceFee = Number(settingsRows[0].service_fee);
    const deliveryFee = Number(settingsRows[0].delivery_fee);
    const serviceFeeMode =
      String(settingsRows[0].service_fee_mode || "flat")
        .trim()
        .toLowerCase() === "percentage"
        ? "percentage"
        : "flat";
    const serviceFeePercentage = Number(settingsRows[0].service_fee_percentage);

    if (!Number.isFinite(baseServiceFee) || !Number.isFinite(deliveryFee)) {
      throw new Error("Invalid fee settings");
    }

    const groupsMap: Record<string, VendorGroup> = {};
    const missingSubaccounts: string[] = [];
    let itemsSubtotal = 0;

    const paystackKeyMode = getPaystackKeyMode(PAYSTACK_SECRET_KEY);

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
    ) as DeliveryCandidate[];

    if (deliveryCandidates.length === 0) {
      throw new Error(
        "No available delivery personnel with verified payout accounts",
      );
    }

    const deliveryCandidateIds = deliveryCandidates.map((candidate) =>
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

    const eligibleDeliveryCandidates: DeliveryCandidate[] = [];

    for (const candidate of deliveryCandidates) {
      const deliveryId = String(candidate?.id || "").trim();
      const subaccountCode = String(candidate?.payment_account || "").trim();
      if (!deliveryId || !subaccountCode) continue;

      const localApproved =
        Boolean(candidate?.account_verified) ||
        Boolean(bankVerifiedByDeliveryId.get(deliveryId));

      const detailsRes = await fetch(
        `https://api.paystack.co/subaccount/${encodeURIComponent(subaccountCode)}`,
        { headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` } },
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

      // Self-heal stale approval state after successful external verification.
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
      throw new Error("Unable to assign delivery personnel for this payment");
    }

    const deliverySubaccount = String(
      assignedDelivery.payment_account || "",
    ).trim();
    if (!deliverySubaccount) {
      throw new Error(
        "Assigned delivery personnel has no payout subaccount configured",
      );
    }

    for (const item of cartItems as any[]) {
      const vendor = item?.meal?.vendor;
      const vendorId = String(vendor?.id || "").trim();

      if (!vendorId) {
        throw new Error(`Missing vendor for meal ${item.meal_id}`);
      }

      if (vendor?.deleted_at) {
        throw new Error("One or more vendors in your cart are unavailable");
      }

      const paymentAccount = String(vendor?.payment_account || "").trim();
      const accountVerified = Boolean(vendor?.account_verified);

      if (!paymentAccount || !accountVerified) {
        missingSubaccounts.push(vendorId);
      }

      if (!groupsMap[vendorId]) {
        groupsMap[vendorId] = {
          vendorId,
          subaccount: paymentAccount,
          subtotal: 0,
          itemCount: 0,
        };
      }

      const pricing = getMealPricingDetails(
        item?.meal,
        item?.selected_size,
        item?.selected_specifications,
      );
      const unitPrice = Number(pricing.unitPrice || 0);
      const quantity = Number(item?.quantity || 0);
      const lineTotal = unitPrice * quantity;

      groupsMap[vendorId].subtotal += lineTotal;
      groupsMap[vendorId].itemCount += quantity;
      itemsSubtotal += lineTotal;
    }

    if (missingSubaccounts.length > 0) {
      const uniqueMissing = Array.from(new Set(missingSubaccounts));
      throw new Error(
        `Missing or unverified payout accounts for vendors: ${uniqueMissing.join(", ")}`,
      );
    }

    const vendorGroups = Object.values(groupsMap).map((group) => ({
      ...group,
      subtotal: roundCurrency(group.subtotal),
    }));

    itemsSubtotal = roundCurrency(itemsSubtotal);
    const serviceFee = computeServiceFeeAmount(
      itemsSubtotal,
      serviceFeeMode,
      baseServiceFee,
      serviceFeePercentage,
    );
    const totalAmount = roundCurrency(itemsSubtotal + serviceFee + deliveryFee);

    const paidAmountRequested = Number(body?.amount || 0);
    if (Number.isFinite(paidAmountRequested) && paidAmountRequested > 0) {
      const paidAmountCedis =
        paidAmountRequested > 100000
          ? paidAmountRequested / 100
          : paidAmountRequested;
      if (Math.abs(paidAmountCedis - totalAmount) > 0.01) {
        console.warn("initialize-payment amount mismatch", {
          reference,
          expected: totalAmount,
          requested: paidAmountCedis,
          itemsSubtotal,
          serviceFee,
          deliveryFee,
        });
      }
    }

    const totalAmountPesewas = Math.round(totalAmount * 100);
    const platformFeePesewas = Math.max(
      0,
      Math.round((serviceFee + deliveryFee) * 100),
    );

    const initPayload: Record<string, any> = {
      email: customerEmail,
      amount: totalAmountPesewas,
      currency: "GHS",
      reference,
      metadata: {
        order_data: {
          ...orderData,
          deliveryPersonnelId: assignedDelivery.id,
        },
        fees: {
          service_fee: serviceFee,
          delivery_fee: deliveryFee,
          items_subtotal: itemsSubtotal,
          total_amount: totalAmount,
        },
        assignment: {
          delivery_personnel_id: assignedDelivery.id,
          strategy: "least_active_then_highest_rating",
        },
        vendors: vendorGroups.map((group) => ({
          vendor_id: group.vendorId,
          subtotal: group.subtotal,
          item_count: group.itemCount,
          payment_account: group.subaccount,
        })),
      },
    };

    let splitMode: "none" | "single_subaccount" | "split_group" = "none";
    let splitCode: string | null = null;
    let splitSubaccounts: any[] = [];
    const deliveryFeePesewas = Math.max(0, Math.round(deliveryFee * 100));
    const hasDeliveryBeneficiary = deliveryFeePesewas > 0;

    if (vendorGroups.length === 1 && !hasDeliveryBeneficiary) {
      splitMode = "single_subaccount";
      const single = vendorGroups[0];
      const transactionCharge = Math.min(
        Math.max(0, platformFeePesewas),
        Math.max(totalAmountPesewas - 1, 0),
      );

      initPayload.subaccount = single.subaccount;
      initPayload.transaction_charge = transactionCharge;
      initPayload.bearer = "account";

      splitSubaccounts = [
        {
          vendor_id: single.vendorId,
          subaccount: single.subaccount,
          subtotal: single.subtotal,
          share: Math.round(single.subtotal * 100),
        },
      ];
    } else if (vendorGroups.length > 0) {
      splitMode = "split_group";

      const paystackSubaccounts = vendorGroups.map((group) => ({
        subaccount: group.subaccount,
        share: Math.round(group.subtotal * 100),
      }));

      if (hasDeliveryBeneficiary) {
        paystackSubaccounts.push({
          subaccount: deliverySubaccount,
          share: deliveryFeePesewas,
        });
      }

      const splitPayload = {
        name: `CHAWP-${reference}`,
        type: "flat",
        currency: "GHS",
        subaccounts: paystackSubaccounts,
        bearer_type: "all-proportional",
      };

      const splitRes = await fetch("https://api.paystack.co/split", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(splitPayload),
      });

      const splitData = await splitRes.json();
      if (!splitRes.ok || splitData.status !== true) {
        throw new Error(splitData.message || "Failed to create Paystack split");
      }

      splitCode = String(splitData?.data?.split_code || "").trim();
      if (!splitCode) {
        throw new Error("Paystack split created without split_code");
      }

      initPayload.split_code = splitCode;
      splitSubaccounts = vendorGroups.map((group) => ({
        vendor_id: group.vendorId,
        subaccount: group.subaccount,
        subtotal: group.subtotal,
        share: Math.round(group.subtotal * 100),
      }));

      if (hasDeliveryBeneficiary) {
        splitSubaccounts.push({
          delivery_personnel_id: assignedDelivery.id,
          subaccount: deliverySubaccount,
          subtotal: deliveryFee,
          share: deliveryFeePesewas,
          type: "delivery_fee",
        });
      }
    }

    const initRes = await fetch(
      "https://api.paystack.co/transaction/initialize",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(initPayload),
      },
    );

    const initData = await initRes.json();

    if (!initRes.ok || initData.status !== true) {
      throw new Error(initData.message || "Paystack initialize failed");
    }

    const paystackData = initData?.data || {};
    const authorizationUrl = String(
      paystackData.authorization_url || "",
    ).trim();
    const accessCode = String(paystackData.access_code || "").trim();

    if (!authorizationUrl || !accessCode) {
      throw new Error("Paystack initialize returned incomplete response");
    }

    const paymentPayload = {
      reference,
      user_id: user.id,
      payment_provider: "paystack",
      currency: "GHS",
      status: "initialized",
      split_mode: splitMode,
      split_code: splitCode,
      subaccounts: splitSubaccounts,
      items_subtotal: itemsSubtotal,
      service_fee: serviceFee,
      delivery_fee: deliveryFee,
      total_amount: totalAmount,
      paystack_response: paystackData,
      metadata: {
        initialized_at: new Date().toISOString(),
        cart_item_count: cartItems.length,
        order_data: {
          ...orderData,
          deliveryPersonnelId: assignedDelivery.id,
        },
      },
    };

    const { error: paymentUpsertError } = await writeClient
      .from("chawp_payments")
      .upsert(paymentPayload, { onConflict: "reference" });

    if (paymentUpsertError) {
      throw new Error(
        paymentUpsertError.message || "Failed to persist payment",
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        reference,
        authorizationUrl,
        accessCode,
        amount: totalAmount,
        splitMode,
        splitCode,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error) {
    console.error("initialize-payment error", error);

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
