import { supabase } from "../config/supabase";

// Paystack configuration
const PAYSTACK_PUBLIC_KEY = "pk_live_014478be275a6453efab7529d14bd938c8b9b964";
const SUPABASE_FUNCTIONS_BASE_URL =
  "https://qxxflbymaoledpluzqtb.supabase.co/functions/v1";

const INITIALIZE_PAYMENT_URL = `${SUPABASE_FUNCTIONS_BASE_URL}/initialize-payment`;
const VERIFY_PAYMENT_URL = `${SUPABASE_FUNCTIONS_BASE_URL}/verify-payment`;
const CREATE_PAY_AFTER_DELIVERY_ORDER_URLS = [
  `${SUPABASE_FUNCTIONS_BASE_URL}/ord-create`,
  `${SUPABASE_FUNCTIONS_BASE_URL}/create-pay-after-delivery-order`,
];
const INITIALIZE_PAYMENT_FOR_ORDERS_URL = `${SUPABASE_FUNCTIONS_BASE_URL}/ord-pay-init`;
const VERIFY_PAYMENT_FOR_ORDERS_URL = `${SUPABASE_FUNCTIONS_BASE_URL}/ord-pay-verify`;

async function parseResponseBody(response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

/**
 * Initialize Paystack payment via Edge Function (secure, split-aware)
 * @param {object} params
 * @param {string} params.reference - Unique payment reference
 * @param {object} params.orderData - Checkout details used by backend validation
 * @param {number} [params.amount] - Optional amount for sanity validation
 * @returns {Promise<object>} - Payment initialization response
 */
export async function initializePaystackPayment({
  reference,
  orderData,
  amount,
} = {}) {
  try {
    // Get the current user's session for authorization
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      throw new Error("User not authenticated");
    }

    if (!reference) {
      throw new Error("Payment reference is required");
    }

    console.log("Initializing payment with server-side split flow", {
      reference,
      amount,
    });

    // Call Edge Function to initialize payment (secure with secret key on server)
    const response = await fetch(INITIALIZE_PAYMENT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        reference,
        orderData: orderData || {},
        amount,
      }),
    });

    console.log("Response status:", response.status);

    const data = await response.json();

    console.log("Edge Function response:", data);

    if (!response.ok || !data.success) {
      const initErrorMessage =
        data.error ||
        data.message ||
        `HTTP ${response.status}: Failed to initialize payment`;

      // Backward-compatibility path for environments where initialize-payment
      // expects pre-created unpaid orders (`orderIds`).
      if (/orderIds\s+is\s+required/i.test(initErrorMessage)) {
        const createResult = await createPayAfterDeliveryOrder({
          orderData: orderData || {},
        });

        const orderIds = (createResult?.orders || [])
          .map((order) => order?.id)
          .filter(Boolean);

        if (orderIds.length === 0) {
          throw new Error(
            "Failed to initialize payment: no order IDs returned for fallback flow",
          );
        }

        const orderInitResult = await initializePaystackPaymentForOrders({
          reference,
          orderIds,
        });

        return {
          ...orderInitResult,
          orderIds,
          usesOrderIdsFlow: true,
        };
      }

      throw new Error(initErrorMessage);
    }

    // Validate response has required fields
    if (!data.reference || !data.authorizationUrl || !data.accessCode) {
      console.error("Invalid response structure:", data);
      throw new Error("Invalid response from payment service");
    }

    // Return the data directly from the Edge Function
    return {
      success: true,
      reference: data.reference,
      authorizationUrl: data.authorizationUrl,
      accessCode: data.accessCode,
      splitMode: data.splitMode,
      amount: data.amount,
    };
  } catch (error) {
    console.error("Paystack initialization error:", error);
    console.error("Error details:", {
      message: error.message,
      name: error.name,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Verify payment and create order via Supabase Edge Function
 * @param {string} reference - Paystack payment reference
 * @param {object} orderData - Order details
 * @returns {Promise<object>} - Order creation result
 */
export async function verifyPaymentAndCreateOrder(reference, orderData) {
  try {
    // Get current session
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session) {
      throw new Error("Authentication required");
    }

    console.log("Verifying payment:", { reference, orderData });

    // Call Supabase Edge Function to verify payment and create order
    const response = await fetch(VERIFY_PAYMENT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        reference,
        orderData,
      }),
    });

    const data = await response.json();

    console.log("Verification response:", data);

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Payment verification failed");
    }

    return data;
  } catch (error) {
    console.error("Payment verification error:", error);
    throw error;
  }
}

/**
 * Create unpaid order(s) when pay-after-delivery is enabled.
 * @param {object} params
 * @param {object} params.orderData - Checkout details used by backend
 */
export async function createPayAfterDeliveryOrder({ orderData } = {}) {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      throw new Error("User not authenticated");
    }

    let lastError = null;

    for (
      let index = 0;
      index < CREATE_PAY_AFTER_DELIVERY_ORDER_URLS.length;
      index += 1
    ) {
      const endpoint = CREATE_PAY_AFTER_DELIVERY_ORDER_URLS[index];

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          orderData: orderData || {},
        }),
      });

      const data = await parseResponseBody(response);

      if (response.ok && data?.success) {
        return data;
      }

      const detailedMessage =
        data?.error ||
        data?.message ||
        data?.details ||
        data?.raw ||
        `HTTP ${response.status}: Failed to create order`;

      const looksLikeMissingFunction =
        response.status === 404 ||
        /not\s+found|function|does\s+not\s+exist/i.test(
          String(detailedMessage).toLowerCase(),
        );

      const hasFallback =
        index < CREATE_PAY_AFTER_DELIVERY_ORDER_URLS.length - 1;

      if (looksLikeMissingFunction && hasFallback) {
        lastError = new Error(String(detailedMessage));
        continue;
      }

      throw new Error(String(detailedMessage));
    }

    if (lastError) {
      throw lastError;
    }

    throw new Error("Failed to create order");
  } catch (error) {
    console.error("Pay-after-delivery order creation error:", error);
    throw error;
  }
}

/**
 * Initialize Paystack payment for one or more existing unpaid orders.
 * @param {object} params
 * @param {string} params.reference
 * @param {string[]} params.orderIds
 */
export async function initializePaystackPaymentForOrders({
  reference,
  orderIds,
} = {}) {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      throw new Error("User not authenticated");
    }

    if (!reference) {
      throw new Error("Payment reference is required");
    }

    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      throw new Error("orderIds is required");
    }

    const response = await fetch(INITIALIZE_PAYMENT_FOR_ORDERS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        reference,
        orderIds,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Failed to initialize payment");
    }

    return {
      success: true,
      reference: data.reference,
      authorizationUrl: data.authorizationUrl,
      accessCode: data.accessCode,
      splitMode: data.splitMode,
      amount: data.amount,
    };
  } catch (error) {
    console.error("Paystack init-for-orders error:", error);
    throw error;
  }
}

/**
 * Verify Paystack payment and apply it to existing order(s).
 * @param {string} reference
 * @param {string[]} orderIds
 */
export async function verifyPaymentForOrders(reference, orderIds) {
  try {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session) {
      throw new Error("Authentication required");
    }

    const response = await fetch(VERIFY_PAYMENT_FOR_ORDERS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        reference,
        orderIds,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Payment verification failed");
    }

    return data;
  } catch (error) {
    console.error("Paystack verify-for-orders error:", error);
    throw error;
  }
}

/**
 * Check payment status
 * @param {string} reference - Paystack payment reference
 * @returns {Promise<object>} - Payment status
 */
export async function checkPaymentStatus(reference) {
  try {
    const response = await fetch(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${PAYSTACK_PUBLIC_KEY}`,
        },
      },
    );

    const data = await response.json();

    if (!response.ok || !data.status) {
      throw new Error(data.message || "Failed to check payment status");
    }

    return {
      success: true,
      status: data.data.status,
      amount: data.data.amount / 100, // Convert from pesewas to cedis
      paidAt: data.data.paid_at,
      reference: data.data.reference,
    };
  } catch (error) {
    console.error("Payment status check error:", error);
    throw error;
  }
}

/**
 * Generate a unique payment reference
 * @returns {string} - Unique reference
 */
export function generatePaymentReference() {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000000);
  return `CHAWP_${timestamp}_${random}`;
}

/**
 * Get Paystack public key for in-app payments
 * @returns {string} - Paystack public key
 */
export function getPaystackPublicKey() {
  return PAYSTACK_PUBLIC_KEY;
}
