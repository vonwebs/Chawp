// Supabase Edge Function: ord-pay-verify (verify Paystack payment and apply it to existing order(s))
// - Marks orders as paid
// - Writes vendor payout ledger entries
// - Marks/creates delivery earning
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

    const { data: existingPayment } = await writeClient
      .from("chawp_payments")
      .select("reference, status, total_amount, metadata")
      .eq("reference", reference)
      .maybeSingle();

    if (existingPayment?.status === "paid") {
      const recordedOrderIds = Array.isArray(
        existingPayment?.metadata?.order_ids,
      )
        ? existingPayment.metadata.order_ids
        : orderIds;

      const { data: existingOrders } = await writeClient
        .from("chawp_orders")
        .select("*")
        .in("id", recordedOrderIds);

      return new Response(
        JSON.stringify({
          success: true,
          orders: existingOrders || [],
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
        vendor:chawp_vendors(id)
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

    // Expected totals from stored fields.
    let expectedItemsSubtotal = 0;
    let expectedServiceFee = 0;
    let expectedDeliveryFee = 0;

    const vendorTotals: Record<string, number> = {};

    for (const order of orders as any[]) {
      const vendorId = String(order?.vendor_id || "").trim();
      const subtotal = roundCurrency(Number(order?.total_amount || 0));
      const sFee = roundCurrency(Number(order?.service_fee || 0));
      const dFee = roundCurrency(Number(order?.delivery_fee || 0));

      expectedItemsSubtotal += subtotal;
      expectedServiceFee += sFee;
      expectedDeliveryFee += dFee;

      vendorTotals[vendorId] = roundCurrency(
        Number(vendorTotals[vendorId] || 0) + subtotal,
      );
    }

    expectedItemsSubtotal = roundCurrency(expectedItemsSubtotal);
    expectedServiceFee = roundCurrency(expectedServiceFee);
    expectedDeliveryFee = roundCurrency(expectedDeliveryFee);

    const expectedTotal = roundCurrency(
      expectedItemsSubtotal + expectedServiceFee + expectedDeliveryFee,
    );

    const paidAmount = Number(paymentInfo.amount || 0) / 100;

    if (Math.abs(paidAmount - expectedTotal) > 0.01) {
      throw new Error(
        `Amount mismatch. Expected ${expectedTotal}, got ${paidAmount}`,
      );
    }

    // Mark orders as paid.
    const { data: updatedOrders, error: updateOrdersError } = await writeClient
      .from("chawp_orders")
      .update({
        payment_status: "paid",
        payment_reference: reference,
        payment_method: "paystack",
        updated_at: new Date().toISOString(),
      })
      .in("id", orderIds)
      .select();

    if (updateOrdersError) {
      throw new Error(updateOrdersError.message || "Failed to update orders");
    }

    // Vendor payout ledger handling:
    // Keep payouts pending so admin can explicitly mark settlement as completed.
    for (const order of orders as any[]) {
      const vendorId = String(order?.vendor_id || "").trim();
      const orderId = String(order?.id || "").trim();
      const payoutAmount = roundCurrency(Number(order?.total_amount || 0));

      if (!vendorId || !orderId) continue;

      const { data: pendingPayout, error: pendingPayoutLookupError } =
        await writeClient
          .from("chawp_vendor_payouts")
          .select("id, status")
          .eq("vendor_id", vendorId)
          .eq("status", "pending")
          .is("reference_number", null)
          .ilike("notes", `%${orderId}%`)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

      if (pendingPayoutLookupError) {
        console.error(
          "Failed to lookup pending vendor payout:",
          pendingPayoutLookupError,
        );
        continue;
      }

      if (pendingPayout?.id) {
        const { error: payoutUpdateError } = await writeClient
          .from("chawp_vendor_payouts")
          .update({
            payment_method: "paystack_split",
            reference_number: reference,
            notes: `Customer payment received (${reference}) for order ${orderId}. Awaiting admin payout settlement.`,
          })
          .eq("id", pendingPayout.id);

        if (payoutUpdateError) {
          console.error(
            "Failed to update pending vendor payout:",
            payoutUpdateError,
          );
        }
      } else {
        // Backfill when pending payout record was not created at order placement.
        const { error: payoutCreateError } = await writeClient
          .from("chawp_vendor_payouts")
          .insert({
            vendor_id: vendorId,
            amount: payoutAmount,
            status: "pending",
            payment_method: "paystack_split",
            reference_number: reference,
            notes: `Customer payment received (${reference}) for order ${orderId}. Awaiting admin payout settlement.`,
          });

        if (payoutCreateError) {
          console.error(
            "Failed to backfill pending vendor payout:",
            payoutCreateError,
          );
        }
      }
    }

    // Delivery earning: update existing pending record if present; otherwise insert.
    if (deliveryPersonnelId && expectedDeliveryFee > 0) {
      const orderIdForEarning = orders.length === 1 ? orders[0]?.id : null;

      if (orderIdForEarning) {
        const { data: existingEarning } = await writeClient
          .from("chawp_delivery_earnings")
          .select("id, status")
          .eq("delivery_personnel_id", deliveryPersonnelId)
          .eq("order_id", orderIdForEarning)
          .eq("type", "delivery_fee")
          .maybeSingle();

        if (existingEarning?.id) {
          const { error: earningUpdateError } = await writeClient
            .from("chawp_delivery_earnings")
            .update({
              amount: roundCurrency(expectedDeliveryFee),
              status: "paid",
              payment_method: "paystack_split",
              reference_number: reference,
              paid_at: new Date().toISOString(),
            })
            .eq("id", existingEarning.id);

          if (earningUpdateError) {
            console.error(
              "Failed to update delivery earning:",
              earningUpdateError,
            );
          }
        } else {
          const { error: deliveryEarningError } = await writeClient
            .from("chawp_delivery_earnings")
            .insert({
              delivery_personnel_id: deliveryPersonnelId,
              order_id: orderIdForEarning,
              amount: roundCurrency(expectedDeliveryFee),
              type: "delivery_fee",
              description: `Auto-settled delivery fee from pay-after-delivery payment ${reference}`,
              status: "paid",
              payment_method: "paystack_split",
              reference_number: reference,
              earned_at: new Date().toISOString(),
              paid_at: new Date().toISOString(),
            });

          if (deliveryEarningError) {
            console.error(
              "Failed to create delivery earning:",
              deliveryEarningError,
            );
          }
        }
      }
    }

    // Finalize payment ledger.
    const { error: finalizeError } = await writeClient
      .from("chawp_payments")
      .upsert(
        {
          reference,
          user_id: user.id,
          payment_provider: "paystack",
          currency: String(paymentInfo.currency || "GHS").toUpperCase(),
          status: "paid",
          items_subtotal: expectedItemsSubtotal,
          service_fee: expectedServiceFee,
          delivery_fee: expectedDeliveryFee,
          total_amount: expectedTotal,
          paystack_transaction_id:
            paymentInfo.id != null ? Number(paymentInfo.id) : null,
          paystack_response: paymentInfo,
          paid_at: new Date().toISOString(),
          metadata: {
            ...(existingPayment?.metadata || {}),
            mode: "pay_after_delivery",
            order_ids: orders.map((o: any) => o.id),
            delivery_personnel_id: deliveryPersonnelId,
            verify_completed_at: new Date().toISOString(),
          },
        },
        { onConflict: "reference" },
      );

    if (finalizeError) {
      console.error("Failed to finalize payment ledger:", finalizeError);
    }

    // Notify customer that payment verification/order completion succeeded.
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
        await userClient.functions.invoke("send-push-notification", {
          body: {
            tokens: customerTokens,
            title: "Payment Confirmed",
            body: `Payment received for your order${orders.length > 1 ? "s" : ""}. Total: GH₵${expectedTotal.toFixed(2)}.`,
            data: {
              orderId: orders[0]?.id,
              type: "order_payment_confirmed",
              channelId: "orders",
            },
          },
        });
      }
    } catch (customerNotifError) {
      console.error(
        "Failed to send customer payment confirmation notification:",
        customerNotifError,
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        orders: updatedOrders || [],
        totalAmount: expectedTotal,
        paymentReference: reference,
        message: "Payment verified and orders updated successfully",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error) {
    console.error("ord-pay-verify error:", error);

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
