// Supabase Edge Function: ord-pay-init (initialize Paystack payment for existing unpaid order(s))
// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const roundCurrency = (value: number) => Math.round(value * 100) / 100;

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!PAYSTACK_SECRET_KEY) {
      throw new Error("Paystack secret key not configured");
    }

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Supabase environment is not configured correctly");
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

    const body = await req.json();
    const reference = String(body?.reference || "").trim();
    const orderIds = Array.isArray(body?.orderIds)
      ? body.orderIds.map((id: any) => String(id || "").trim()).filter(Boolean)
      : [];

    if (!reference) {
      throw new Error("Payment reference is required");
    }

    if (orderIds.length === 0) {
      throw new Error("orderIds is required");
    }

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
      .select("reference, status, paystack_response")
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

    const { data: orders, error: ordersError } = await writeClient
      .from("chawp_orders")
      .select(
        `
        id,
        user_id,
        vendor_id,
        total_amount,
        service_fee,
        delivery_fee,
        payment_status,
        status,
        delivery_personnel_id,
        vendor:chawp_vendors(id, payment_account, account_verified, deleted_at),
        order_items:chawp_order_items(quantity, unit_price)
      `,
      )
      .in("id", orderIds)
      .eq("user_id", user.id);

    if (ordersError) {
      throw new Error(ordersError.message || "Failed to fetch orders");
    }

    if (!orders || orders.length === 0) {
      throw new Error("No matching orders found");
    }

    const unpaid = orders.filter(
      (order: any) =>
        String(order?.payment_status || "").toLowerCase() !== "paid",
    );
    if (unpaid.length !== orders.length) {
      throw new Error("One or more orders are already paid");
    }

    // For now, only support orders assigned to the same delivery personnel.
    const deliveryIds = Array.from(
      new Set(
        orders
          .map((o: any) => String(o?.delivery_personnel_id || "").trim())
          .filter(Boolean),
      ),
    );

    if (deliveryIds.length > 1) {
      throw new Error("Orders belong to multiple delivery personnel");
    }

    const deliveryPersonnelId =
      deliveryIds.length === 1 ? deliveryIds[0] : null;

    // Compute totals from stored order fields.
    const vendorGroupsMap: Record<
      string,
      { vendorId: string; subaccount: string; subtotal: number }
    > = {};

    let itemsSubtotal = 0;
    let serviceFee = 0;
    let deliveryFee = 0;

    for (const order of orders as any[]) {
      const vendorId = String(order?.vendor_id || "").trim();
      const vendor = order?.vendor;

      if (!vendorId || !vendor) {
        throw new Error("Order vendor information missing");
      }

      if (vendor?.deleted_at) {
        throw new Error("One or more vendors are unavailable");
      }

      const subaccount = String(vendor?.payment_account || "").trim();
      const accountVerified = Boolean(vendor?.account_verified);
      if (!subaccount || !accountVerified) {
        throw new Error(
          `Missing or unverified payout account for vendor ${vendorId}`,
        );
      }

      if (!vendorGroupsMap[vendorId]) {
        vendorGroupsMap[vendorId] = { vendorId, subaccount, subtotal: 0 };
      }

      const orderItems = Array.isArray(order?.order_items)
        ? order.order_items
        : [];
      const computedOrderSubtotal = roundCurrency(
        orderItems.reduce(
          (sum: number, item: any) =>
            sum + Number(item?.quantity || 0) * Number(item?.unit_price || 0),
          0,
        ),
      );

      const orderSubtotal = roundCurrency(
        Number.isFinite(Number(order?.total_amount))
          ? Number(order.total_amount)
          : computedOrderSubtotal,
      );

      vendorGroupsMap[vendorId].subtotal += orderSubtotal;
      itemsSubtotal += orderSubtotal;

      serviceFee += roundCurrency(Number(order?.service_fee || 0));
      deliveryFee += roundCurrency(Number(order?.delivery_fee || 0));
    }

    itemsSubtotal = roundCurrency(itemsSubtotal);
    serviceFee = roundCurrency(serviceFee);
    deliveryFee = roundCurrency(deliveryFee);

    const totalAmount = roundCurrency(itemsSubtotal + serviceFee + deliveryFee);

    if (totalAmount <= 0) {
      throw new Error("Invalid amount for payment initialization");
    }

    const paystackKeyMode = getPaystackKeyMode(PAYSTACK_SECRET_KEY);

    // Delivery beneficiary.
    let deliverySubaccount = "";
    if (deliveryPersonnelId && deliveryFee > 0) {
      const { data: deliveryPerson, error: deliveryError } = await writeClient
        .from("chawp_delivery_personnel")
        .select("id, payment_account, account_verified")
        .eq("id", deliveryPersonnelId)
        .maybeSingle();

      if (deliveryError || !deliveryPerson) {
        throw new Error("Delivery personnel not found");
      }

      const localApproved = Boolean(deliveryPerson?.account_verified);
      const subaccountCode = String(
        deliveryPerson?.payment_account || "",
      ).trim();
      if (!subaccountCode) {
        throw new Error("Delivery personnel payout subaccount missing");
      }

      const detailsRes = await fetch(
        `https://api.paystack.co/subaccount/${encodeURIComponent(subaccountCode)}`,
        { headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` } },
      );

      const detailsJson = await detailsRes.json();

      if (!detailsRes.ok || detailsJson.status !== true) {
        if (isSubaccountMissingResponse(detailsRes.status, detailsJson)) {
          throw new Error("Delivery subaccount missing on Paystack");
        }
        throw new Error(
          detailsJson?.message || "Failed to verify delivery subaccount",
        );
      }

      const paystackVerified = isSubaccountVerified(detailsJson?.data || {});

      const payoutApproved =
        paystackKeyMode === "test"
          ? localApproved || paystackVerified
          : localApproved && paystackVerified;

      if (!payoutApproved) {
        throw new Error("Delivery payout account is not verified");
      }

      deliverySubaccount = String(
        detailsJson?.data?.subaccount_code || subaccountCode,
      ).trim();

      if (!deliverySubaccount) {
        deliverySubaccount = subaccountCode;
      }
    }

    const vendorGroups = Object.values(vendorGroupsMap).map((group) => ({
      ...group,
      subtotal: roundCurrency(group.subtotal),
    }));

    const totalAmountPesewas = Math.round(totalAmount * 100);
    const deliveryFeePesewas = Math.max(0, Math.round(deliveryFee * 100));

    const initPayload: Record<string, any> = {
      email: customerEmail,
      amount: totalAmountPesewas,
      currency: "GHS",
      reference,
      metadata: {
        mode: "pay_after_delivery",
        order_ids: orders.map((o: any) => o.id),
        fees: {
          service_fee: serviceFee,
          delivery_fee: deliveryFee,
          items_subtotal: itemsSubtotal,
          total_amount: totalAmount,
        },
      },
    };

    let splitMode: "none" | "single_subaccount" | "split_group" = "none";
    let splitCode: string | null = null;
    let splitSubaccounts: any[] = [];

    const hasDeliveryBeneficiary =
      deliveryFeePesewas > 0 && Boolean(deliverySubaccount);

    if (vendorGroups.length === 1 && !hasDeliveryBeneficiary) {
      splitMode = "single_subaccount";
      const single = vendorGroups[0];
      initPayload.subaccount = single.subaccount;
      initPayload.bearer = "account";
      initPayload.transaction_charge = Math.max(
        0,
        Math.round((serviceFee + deliveryFee) * 100),
      );

      splitSubaccounts = [
        {
          vendor_id: single.vendorId,
          subaccount: single.subaccount,
          subtotal: single.subtotal,
          share: Math.round(single.subtotal * 100),
        },
      ];
    } else {
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
          delivery_personnel_id: deliveryPersonnelId,
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
        mode: "pay_after_delivery",
        order_ids: orders.map((order: any) => order.id),
        delivery_personnel_id: deliveryPersonnelId,
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
    console.error("ord-pay-init error", error);

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
