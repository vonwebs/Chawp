// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BANK_LIST_TTL_MS = 1000 * 60 * 10;
const bankListCache: Record<string, { expiresAt: number; data: any[] }> = {};

type RequesterContext = {
  user: any;
  profile: any;
  role: string;
};

const isAdminRole = (role: string) =>
  ["admin", "super_admin"].includes(String(role || "").toLowerCase());

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

const getEffectiveVerificationState = (sub: any): boolean => {
  return isSubaccountVerified(sub);
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

const getPaystackKeyMode = (secretKey: string | undefined): string => {
  const key = String(secretKey || "")
    .trim()
    .toLowerCase();
  if (key.startsWith("sk_test_")) return "test";
  if (key.startsWith("sk_live_")) return "live";
  return "unknown";
};

const normalizeBanks = (banks: any[]): any[] => {
  const byCode = new Map<string, any>();

  for (const bank of banks || []) {
    if (!bank) continue;
    if (bank.active === false || bank.is_deleted === true) continue;

    const code = String(bank.code || "").trim();
    const name = String(bank.name || "").trim();

    if (!code || !name) continue;

    const existing = byCode.get(code);
    if (!existing) {
      byCode.set(code, { ...bank, code, name });
      continue;
    }

    // Prefer the shortest name to collapse branch-specific variants
    // (e.g., "XYZ Bank - East Legon Branch" -> "XYZ Bank").
    const existingName = String(existing.name || "").trim();
    const shouldReplace =
      name.length < existingName.length ||
      (name.length === existingName.length &&
        name.toLowerCase() < existingName.toLowerCase());

    if (shouldReplace) {
      byCode.set(code, { ...existing, ...bank, code, name });
    }
  }

  return Array.from(byCode.values()).sort((a, b) =>
    String(a.name || "").localeCompare(String(b.name || "")),
  );
};

const getRequesterContext = async (
  req: Request,
  supabaseUrl: string,
  anonKey: string,
): Promise<RequesterContext> => {
  const userClient = createClient(supabaseUrl, anonKey, {
    global: {
      headers: { Authorization: req.headers.get("Authorization") ?? "" },
    },
  });

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();

  if (userError || !user) {
    throw new Error("Authentication required");
  }

  const { data: profile } = await userClient
    .from("chawp_user_profiles")
    .select("id, role, email")
    .eq("id", user.id)
    .maybeSingle();

  return {
    user,
    profile,
    role: String(profile?.role || "user").toLowerCase(),
  };
};

const getVendorForMutation = async (
  writeClient: any,
  requester: RequesterContext,
  vendorId?: string,
) => {
  let resolvedVendorId = String(vendorId || "").trim();

  if (!resolvedVendorId && !isAdminRole(requester.role)) {
    const { data: ownVendor, error: ownVendorError } = await writeClient
      .from("chawp_vendors")
      .select("id")
      .eq("user_id", requester.user.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (ownVendorError) {
      throw new Error(ownVendorError.message || "failed_lookup_vendor");
    }

    resolvedVendorId = String(ownVendor?.id || "").trim();
  }

  if (!resolvedVendorId) {
    throw new Error("vendor_id is required");
  }

  const { data: vendor, error: vendorError } = await writeClient
    .from("chawp_vendors")
    .select(
      "id, user_id, name, email, phone, payment_account, payment_currency, payment_provider, account_verified, deleted_at",
    )
    .eq("id", resolvedVendorId)
    .maybeSingle();

  if (vendorError) {
    throw new Error(vendorError.message || "failed_lookup_vendor");
  }

  if (!vendor) {
    throw new Error("vendor not found");
  }

  if (vendor.deleted_at) {
    throw new Error("vendor account is deactivated");
  }

  if (
    !isAdminRole(requester.role) &&
    String(vendor.user_id || "") !== requester.user.id
  ) {
    throw new Error("You can only manage your own vendor account");
  }

  return vendor;
};

const getDeliveryForMutation = async (
  writeClient: any,
  requester: RequesterContext,
  deliveryPersonnelId?: string,
) => {
  let resolvedDeliveryId = String(deliveryPersonnelId || "").trim();

  if (!resolvedDeliveryId && !isAdminRole(requester.role)) {
    const { data: ownDelivery, error: ownDeliveryError } = await writeClient
      .from("chawp_delivery_personnel")
      .select("id")
      .eq("user_id", requester.user.id)
      .is("deleted_at", null)
      .or("is_active.is.null,is_active.eq.true")
      .maybeSingle();

    if (ownDeliveryError) {
      throw new Error(ownDeliveryError.message || "failed_lookup_delivery");
    }

    resolvedDeliveryId = String(ownDelivery?.id || "").trim();
  }

  if (!resolvedDeliveryId) {
    throw new Error("delivery_personnel_id is required");
  }

  const { data: delivery, error: deliveryError } = await writeClient
    .from("chawp_delivery_personnel")
    .select(
      "id, user_id, payment_account, payment_currency, payment_provider, account_verified, deleted_at, is_active",
    )
    .eq("id", resolvedDeliveryId)
    .maybeSingle();

  if (deliveryError) {
    throw new Error(deliveryError.message || "failed_lookup_delivery");
  }

  if (!delivery) {
    throw new Error("delivery personnel not found");
  }

  if (delivery.deleted_at || delivery.is_active === false) {
    throw new Error("delivery account is deactivated");
  }

  if (
    !isAdminRole(requester.role) &&
    String(delivery.user_id || "") !== requester.user.id
  ) {
    throw new Error("You can only manage your own delivery account");
  }

  return delivery;
};

const fetchGhanaBanks = async (paystackSecretKey: string): Promise<any[]> => {
  const country = "ghana";
  const now = Date.now();

  const cacheEntry = bankListCache[country];
  if (cacheEntry && cacheEntry.expiresAt > now) {
    return cacheEntry.data;
  }

  const banksRes = await fetch("https://api.paystack.co/bank?country=ghana", {
    headers: { Authorization: `Bearer ${paystackSecretKey}` },
  });

  const banksJson = await banksRes.json();
  if (!banksRes.ok || banksJson.status !== true) {
    throw new Error(banksJson.message || "failed_fetch_banks");
  }

  const banks = normalizeBanks(banksJson.data || []);

  bankListCache[country] = {
    expiresAt: now + BANK_LIST_TTL_MS,
    data: banks,
  };

  return banks;
};

const resolveSettlementBankCode = (
  banks: any[],
  paymentMethod: string,
  settlementBank: string,
): string => {
  const input = String(settlementBank || "").trim();
  if (!input) throw new Error("settlement_bank is required");

  const inputLower = input.toLowerCase();

  if (paymentMethod === "mobile_money") {
    const providerAliasMap: Record<string, string> = {
      mtn: "mtn",
      airteltigo: "airtel",
      airtel_tigo: "airtel",
      telecel: "telecel",
      vodafone: "telecel",
      vod: "telecel",
    };

    const providerKey = providerAliasMap[inputLower] || inputLower;

    const matched = banks.find(
      (bank: any) =>
        String(bank.code || "").toLowerCase() === providerKey ||
        String(bank.name || "")
          .toLowerCase()
          .includes(providerKey),
    );

    if (!matched?.code) {
      throw new Error("Settlement Bank is invalid");
    }

    return String(matched.code);
  }

  let matched = banks.find(
    (bank: any) =>
      String(bank.code || "").toLowerCase() === inputLower ||
      String(bank.name || "").toLowerCase() === inputLower,
  );

  if (!matched) {
    matched = banks.find((bank: any) =>
      String(bank.name || "")
        .toLowerCase()
        .includes(inputLower),
    );
  }

  if (!matched?.code) {
    throw new Error("Settlement Bank is invalid");
  }

  return String(matched.code);
};

serve(async (req) => {
  let requestAction = "unknown";
  let paystackKeyMode = "unknown";

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY");
    paystackKeyMode = getPaystackKeyMode(PAYSTACK_SECRET_KEY);
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!PAYSTACK_SECRET_KEY)
      throw new Error("PAYSTACK_SECRET_KEY not configured");
    if (!SUPABASE_URL) throw new Error("SUPABASE_URL not configured");
    if (!SUPABASE_ANON_KEY) throw new Error("SUPABASE_ANON_KEY not configured");

    const body = await req.json();
    const action = String(body?.action || "create")
      .trim()
      .toLowerCase();
    requestAction = action;

    const requester = await getRequesterContext(
      req,
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
    );

    if (action === "list_banks") {
      const banks = await fetchGhanaBanks(PAYSTACK_SECRET_KEY);
      return new Response(JSON.stringify({ success: true, data: banks }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    if (!SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for this action");
    }

    const writeClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    if (action === "check_subaccount") {
      const vendor = await getVendorForMutation(
        writeClient,
        requester,
        body?.vendor_id,
      );

      const subaccountCode = String(
        body?.subaccount_code || vendor.payment_account || "",
      ).trim();

      if (!subaccountCode) {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              vendor_id: vendor.id,
              db_has_subaccount: false,
              db_subaccount_code: null,
              exists: false,
              paystack_exists: false,
              deleted_from_paystack: false,
              account_verified: false,
              reason: "missing_subaccount_code",
              diagnostics: {
                action,
                key_mode: paystackKeyMode,
              },
            },
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          },
        );
      }

      const detailsRes = await fetch(
        `https://api.paystack.co/subaccount/${encodeURIComponent(subaccountCode)}`,
        { headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` } },
      );

      const detailsJson = await detailsRes.json();
      if (!detailsRes.ok || detailsJson.status !== true) {
        if (isSubaccountMissingResponse(detailsRes.status, detailsJson)) {
          return new Response(
            JSON.stringify({
              success: true,
              data: {
                vendor_id: vendor.id,
                db_has_subaccount: true,
                db_subaccount_code: subaccountCode,
                exists: false,
                paystack_exists: false,
                deleted_from_paystack: true,
                account_verified: false,
                reason: "subaccount_not_found",
                subaccount_code: subaccountCode,
                diagnostics: {
                  action,
                  key_mode: paystackKeyMode,
                  paystack_status_code: detailsRes.status,
                  paystack_message: String(detailsJson?.message || ""),
                },
              },
            }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 200,
            },
          );
        }

        throw new Error(detailsJson.message || "failed_fetch_subaccount");
      }

      const subaccount = detailsJson.data || {};
      const normalizedSubaccountCode = String(
        subaccount.subaccount_code || subaccountCode,
      ).trim();
      const paystackAccountVerified = getEffectiveVerificationState(subaccount);
      const accountVerified = Boolean(vendor.account_verified);
      const verificationStatus = getSubaccountVerificationStatus(subaccount);

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            vendor_id: vendor.id,
            db_has_subaccount: Boolean(vendor.payment_account),
            db_subaccount_code: String(vendor.payment_account || "") || null,
            exists: true,
            paystack_exists: true,
            deleted_from_paystack: false,
            account_verified: accountVerified,
            paystack_account_verified: paystackAccountVerified,
            subaccount_code: normalizedSubaccountCode,
            subaccount,
            diagnostics: {
              action,
              key_mode: paystackKeyMode,
              paystack_status_code: detailsRes.status,
              paystack_message: String(detailsJson?.message || "ok"),
              paystack_verification_status: verificationStatus,
            },
          },
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    if (action === "check_delivery_subaccount") {
      const delivery = await getDeliveryForMutation(
        writeClient,
        requester,
        body?.delivery_personnel_id,
      );

      const subaccountCode = String(
        body?.subaccount_code || delivery.payment_account || "",
      ).trim();

      if (!subaccountCode) {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              delivery_personnel_id: delivery.id,
              db_has_subaccount: false,
              db_subaccount_code: null,
              exists: false,
              paystack_exists: false,
              deleted_from_paystack: false,
              account_verified: false,
              reason: "missing_subaccount_code",
              diagnostics: {
                action,
                key_mode: paystackKeyMode,
              },
            },
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          },
        );
      }

      const detailsRes = await fetch(
        `https://api.paystack.co/subaccount/${encodeURIComponent(subaccountCode)}`,
        { headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` } },
      );

      const detailsJson = await detailsRes.json();
      if (!detailsRes.ok || detailsJson.status !== true) {
        if (isSubaccountMissingResponse(detailsRes.status, detailsJson)) {
          return new Response(
            JSON.stringify({
              success: true,
              data: {
                delivery_personnel_id: delivery.id,
                db_has_subaccount: true,
                db_subaccount_code: subaccountCode,
                exists: false,
                paystack_exists: false,
                deleted_from_paystack: true,
                account_verified: false,
                reason: "subaccount_not_found",
                subaccount_code: subaccountCode,
                diagnostics: {
                  action,
                  key_mode: paystackKeyMode,
                  paystack_status_code: detailsRes.status,
                  paystack_message: String(detailsJson?.message || ""),
                },
              },
            }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 200,
            },
          );
        }

        throw new Error(detailsJson.message || "failed_fetch_subaccount");
      }

      const subaccount = detailsJson.data || {};
      const normalizedSubaccountCode = String(
        subaccount.subaccount_code || subaccountCode,
      ).trim();
      const paystackAccountVerified = getEffectiveVerificationState(subaccount);
      const accountVerified = Boolean(delivery.account_verified);
      const verificationStatus = getSubaccountVerificationStatus(subaccount);

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            delivery_personnel_id: delivery.id,
            db_has_subaccount: Boolean(delivery.payment_account),
            db_subaccount_code: String(delivery.payment_account || "") || null,
            exists: true,
            paystack_exists: true,
            deleted_from_paystack: false,
            account_verified: accountVerified,
            paystack_account_verified: paystackAccountVerified,
            subaccount_code: normalizedSubaccountCode,
            subaccount,
            diagnostics: {
              action,
              key_mode: paystackKeyMode,
              paystack_status_code: detailsRes.status,
              paystack_message: String(detailsJson?.message || "ok"),
              paystack_verification_status: verificationStatus,
            },
          },
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    if (action === "create_delivery_subaccount") {
      const delivery = await getDeliveryForMutation(
        writeClient,
        requester,
        body?.delivery_personnel_id,
      );

      const paymentMethod = String(
        body?.payment_method ||
          body?.type ||
          delivery.payment_provider ||
          "bank",
      )
        .trim()
        .toLowerCase();

      if (!["bank", "mobile_money"].includes(paymentMethod)) {
        throw new Error("payment_method must be bank or mobile_money");
      }

      const settlementBank = String(body?.settlement_bank || "").trim();
      const accountNumberRaw = String(body?.account_number || "")
        .replace(/\D/g, "")
        .trim();

      if (!accountNumberRaw) {
        throw new Error("account_number is required");
      }

      if (accountNumberRaw.length < 10 || accountNumberRaw.length > 13) {
        throw new Error("account_number is invalid: expected 10 to 13 digits");
      }

      const percentageCharge =
        body?.percentage_charge != null
          ? Number(body.percentage_charge)
          : Number(Deno.env.get("PAYSTACK_DEFAULT_SUBACCOUNT_PERCENTAGE") || 0);

      const currency = String(
        body?.currency || delivery.payment_currency || "GHS",
      ).toUpperCase();

      const { data: deliveryProfile } = await writeClient
        .from("chawp_user_profiles")
        .select("full_name, email, phone")
        .eq("id", delivery.user_id)
        .maybeSingle();

      const banks = await fetchGhanaBanks(PAYSTACK_SECRET_KEY);
      const settlementBankCode = resolveSettlementBankCode(
        banks,
        paymentMethod,
        settlementBank,
      );

      const payload: Record<string, any> = {
        business_name:
          body?.business_name ||
          deliveryProfile?.full_name ||
          `Delivery-${delivery.id.slice(0, 6)}`,
        primary_contact_name:
          body?.primary_contact_name || deliveryProfile?.full_name || null,
        primary_contact_email:
          body?.primary_contact_email || deliveryProfile?.email || null,
        primary_contact_phone:
          body?.primary_contact_phone || deliveryProfile?.phone || null,
        settlement_bank: settlementBankCode,
        account_number: accountNumberRaw,
        percentage_charge: Number.isFinite(percentageCharge)
          ? percentageCharge
          : 0,
        currency,
      };

      const incomingSubaccountCode = String(body?.subaccount_code || "").trim();
      const existingSubaccountCode =
        incomingSubaccountCode || String(delivery.payment_account || "").trim();

      if (!existingSubaccountCode) {
        payload.active = false;
      }

      let mode: "created" | "updated" | "recreated" = existingSubaccountCode
        ? "updated"
        : "created";

      let subaccountRes = await fetch(
        existingSubaccountCode
          ? `https://api.paystack.co/subaccount/${encodeURIComponent(existingSubaccountCode)}`
          : "https://api.paystack.co/subaccount",
        {
          method: existingSubaccountCode ? "PUT" : "POST",
          headers: {
            Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
      );

      let subaccountJson = await subaccountRes.json();

      if (
        existingSubaccountCode &&
        (!subaccountRes.ok || subaccountJson.status !== true) &&
        isSubaccountMissingResponse(subaccountRes.status, subaccountJson)
      ) {
        mode = "recreated";
        subaccountRes = await fetch("https://api.paystack.co/subaccount", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        subaccountJson = await subaccountRes.json();
      }

      if (!subaccountRes.ok || subaccountJson.status !== true) {
        throw new Error(
          subaccountJson.message ||
            "Paystack error creating delivery subaccount",
        );
      }

      let subaccount = subaccountJson.data || {};
      const paymentAccount = String(
        subaccount.subaccount_code ||
          existingSubaccountCode ||
          subaccount.id ||
          "",
      ).trim();

      if (!paymentAccount) {
        throw new Error("Paystack did not return a subaccount code");
      }

      if (existingSubaccountCode) {
        try {
          const detailsRes = await fetch(
            `https://api.paystack.co/subaccount/${encodeURIComponent(paymentAccount)}`,
            { headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` } },
          );
          const detailsJson = await detailsRes.json();
          if (
            detailsRes.ok &&
            detailsJson?.status === true &&
            detailsJson?.data
          ) {
            subaccount = detailsJson.data;
          }
        } catch (_fetchErr) {
          // Do not block successful creation on diagnostics fetch.
        }
      }

      const accountVerified = existingSubaccountCode
        ? getEffectiveVerificationState(subaccount)
        : false;

      const { error: updateDeliveryError } = await writeClient
        .from("chawp_delivery_personnel")
        .update({
          payment_platform: "paystack",
          payment_account: paymentAccount,
          account_code: accountNumberRaw,
          payment_provider: paymentMethod,
          payment_currency: currency,
          account_verified: accountVerified,
          subaccount_created_at: existingSubaccountCode
            ? delivery.subaccount_created_at
            : new Date().toISOString(),
        })
        .eq("id", delivery.id);

      if (updateDeliveryError) {
        throw new Error(
          updateDeliveryError.message || "failed_update_delivery",
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            delivery_personnel_id: delivery.id,
            mode,
            subaccount,
            payment_account: paymentAccount,
            account_verified: accountVerified,
          },
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    if (action === "set_account_verification") {
      if (!isAdminRole(requester.role)) {
        throw new Error("Admin role required for set_account_verification");
      }

      const vendor = await getVendorForMutation(
        writeClient,
        requester,
        body?.vendor_id,
      );
      const requestedVerified = Boolean(body?.verified);
      const subaccountCode = String(
        body?.subaccount_code || vendor.payment_account || "",
      ).trim();

      if (!subaccountCode) {
        throw new Error("vendor has no paystack subaccount");
      }

      const detailsRes = await fetch(
        `https://api.paystack.co/subaccount/${encodeURIComponent(subaccountCode)}`,
        { headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` } },
      );

      const detailsJson = await detailsRes.json();
      if (!detailsRes.ok || detailsJson.status !== true) {
        throw new Error(detailsJson.message || "failed_fetch_subaccount");
      }

      const currentSub = detailsJson.data || {};
      const canonicalSubaccountCode = String(
        currentSub.subaccount_code || subaccountCode,
      ).trim();

      const paystackAccountVerified = getEffectiveVerificationState(currentSub);
      const verificationStatus = getSubaccountVerificationStatus(currentSub);

      if (
        requestedVerified &&
        !paystackAccountVerified &&
        paystackKeyMode !== "test"
      ) {
        throw new Error(
          `Paystack subaccount cannot be verified via this API. Current Paystack status is '${verificationStatus}' in ${paystackKeyMode} mode. Verify it in Paystack Dashboard (Subaccounts > select account > Verify), then retry internal approval.`,
        );
      }

      const accountVerified = requestedVerified;

      const { error: updateVendorError } = await writeClient
        .from("chawp_vendors")
        .update({
          payment_platform: "paystack",
          payment_account: String(canonicalSubaccountCode),
          account_verified: accountVerified,
        })
        .eq("id", vendor.id);

      if (updateVendorError) {
        throw new Error(updateVendorError.message || "failed_update_vendor");
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            vendor_id: vendor.id,
            requested_verified: requestedVerified,
            account_verified: accountVerified,
            paystack_account_verified: paystackAccountVerified,
            subaccount: currentSub,
          },
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    if (action === "set_delivery_account_verification") {
      if (!isAdminRole(requester.role)) {
        throw new Error(
          "Admin role required for set_delivery_account_verification",
        );
      }

      const delivery = await getDeliveryForMutation(
        writeClient,
        requester,
        body?.delivery_personnel_id,
      );
      const requestedVerified = Boolean(body?.verified);
      const subaccountCode = String(
        body?.subaccount_code || delivery.payment_account || "",
      ).trim();

      if (!subaccountCode) {
        throw new Error("delivery personnel has no paystack subaccount");
      }

      const detailsRes = await fetch(
        `https://api.paystack.co/subaccount/${encodeURIComponent(subaccountCode)}`,
        { headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` } },
      );

      const detailsJson = await detailsRes.json();
      if (!detailsRes.ok || detailsJson.status !== true) {
        throw new Error(detailsJson.message || "failed_fetch_subaccount");
      }

      const currentSub = detailsJson.data || {};
      const canonicalSubaccountCode = String(
        currentSub.subaccount_code || subaccountCode,
      ).trim();

      const paystackAccountVerified = getEffectiveVerificationState(currentSub);
      const verificationStatus = getSubaccountVerificationStatus(currentSub);

      if (
        requestedVerified &&
        !paystackAccountVerified &&
        paystackKeyMode !== "test"
      ) {
        throw new Error(
          `Paystack subaccount cannot be verified via this API. Current Paystack status is '${verificationStatus}' in ${paystackKeyMode} mode. Verify it in Paystack Dashboard (Subaccounts > select account > Verify), then retry internal approval.`,
        );
      }

      const accountVerified = requestedVerified;

      const { error: updateDeliveryError } = await writeClient
        .from("chawp_delivery_personnel")
        .update({
          payment_platform: "paystack",
          payment_account: String(canonicalSubaccountCode),
          account_verified: accountVerified,
        })
        .eq("id", delivery.id);

      if (updateDeliveryError) {
        throw new Error(
          updateDeliveryError.message || "failed_update_delivery",
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            delivery_personnel_id: delivery.id,
            requested_verified: requestedVerified,
            account_verified: accountVerified,
            paystack_account_verified: paystackAccountVerified,
            subaccount: currentSub,
          },
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    if (action === "sync_subaccount_status") {
      const vendor = await getVendorForMutation(
        writeClient,
        requester,
        body?.vendor_id,
      );
      const subaccountCode = String(
        body?.subaccount_code || vendor.payment_account || "",
      ).trim();

      if (!subaccountCode) {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              vendor_id: vendor.id,
              skipped: true,
              reason: "missing_subaccount_code",
              in_sync: false,
            },
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          },
        );
      }

      const detailsRes = await fetch(
        `https://api.paystack.co/subaccount/${encodeURIComponent(subaccountCode)}`,
        { headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` } },
      );

      const detailsJson = await detailsRes.json();
      if (!detailsRes.ok || detailsJson.status !== true) {
        throw new Error(detailsJson.message || "failed_fetch_subaccount");
      }

      const subaccount = detailsJson.data || {};
      const normalizedSubaccountCode = String(
        subaccount.subaccount_code || subaccountCode,
      ).trim();
      const accountVerified = getEffectiveVerificationState(subaccount);
      const verificationStatus = getSubaccountVerificationStatus(subaccount);
      const accountCode =
        String(subaccount.account_number || "").trim() || null;

      const inSync =
        String(vendor.payment_platform || "").toLowerCase() === "paystack" &&
        String(vendor.payment_account || "") === normalizedSubaccountCode &&
        Boolean(vendor.account_verified) === accountVerified;

      let updated = false;
      if (!inSync) {
        const { error: updateVendorError } = await writeClient
          .from("chawp_vendors")
          .update({
            payment_platform: "paystack",
            payment_account: normalizedSubaccountCode,
            account_code: accountCode,
            account_verified: accountVerified,
          })
          .eq("id", vendor.id);

        if (updateVendorError) {
          throw new Error(updateVendorError.message || "failed_update_vendor");
        }

        updated = true;
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            vendor_id: vendor.id,
            subaccount_code: normalizedSubaccountCode,
            account_verified: accountVerified,
            paystack_verification_status: verificationStatus,
            in_sync: inSync,
            updated,
            subaccount,
          },
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    const vendor = await getVendorForMutation(
      writeClient,
      requester,
      body?.vendor_id,
    );

    const paymentMethod = String(
      body?.payment_method || body?.type || vendor.payment_provider || "bank",
    )
      .trim()
      .toLowerCase();

    if (!["bank", "mobile_money"].includes(paymentMethod)) {
      throw new Error("payment_method must be bank or mobile_money");
    }

    const settlementBank = String(body?.settlement_bank || "").trim();
    const accountNumberRaw = String(body?.account_number || "")
      .replace(/\D/g, "")
      .trim();

    if (!accountNumberRaw) {
      throw new Error("account_number is required");
    }

    if (accountNumberRaw.length < 10 || accountNumberRaw.length > 13) {
      throw new Error("account_number is invalid: expected 10 to 13 digits");
    }

    const percentageCharge =
      body?.percentage_charge != null
        ? Number(body.percentage_charge)
        : Number(Deno.env.get("PAYSTACK_DEFAULT_SUBACCOUNT_PERCENTAGE") || 0);

    const currency = String(
      body?.currency || vendor.payment_currency || "GHS",
    ).toUpperCase();

    const banks = await fetchGhanaBanks(PAYSTACK_SECRET_KEY);
    const settlementBankCode = resolveSettlementBankCode(
      banks,
      paymentMethod,
      settlementBank,
    );

    const payload: Record<string, any> = {
      business_name:
        body?.business_name || vendor.name || `Vendor-${vendor.id.slice(0, 6)}`,
      primary_contact_name: body?.primary_contact_name || vendor.name || null,
      primary_contact_email:
        body?.primary_contact_email || vendor.email || null,
      primary_contact_phone:
        body?.primary_contact_phone || vendor.phone || null,
      settlement_bank: settlementBankCode,
      account_number: accountNumberRaw,
      percentage_charge: Number.isFinite(percentageCharge)
        ? percentageCharge
        : 0,
      currency,
    };

    const incomingSubaccountCode = String(body?.subaccount_code || "").trim();
    const existingSubaccountCode =
      incomingSubaccountCode || String(vendor.payment_account || "").trim();

    if (!existingSubaccountCode) {
      payload.active = false;
    }

    let mode: "created" | "updated" | "recreated" = existingSubaccountCode
      ? "updated"
      : "created";

    let subaccountRes = await fetch(
      existingSubaccountCode
        ? `https://api.paystack.co/subaccount/${encodeURIComponent(existingSubaccountCode)}`
        : "https://api.paystack.co/subaccount",
      {
        method: existingSubaccountCode ? "PUT" : "POST",
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );

    let subaccountJson = await subaccountRes.json();

    // If local vendor record points to a deleted/missing Paystack subaccount,
    // retry as a fresh create so onboarding can continue.
    if (
      existingSubaccountCode &&
      (!subaccountRes.ok || subaccountJson.status !== true) &&
      isSubaccountMissingResponse(subaccountRes.status, subaccountJson)
    ) {
      mode = "recreated";
      subaccountRes = await fetch("https://api.paystack.co/subaccount", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      subaccountJson = await subaccountRes.json();
    }

    if (!subaccountRes.ok || subaccountJson.status !== true) {
      throw new Error(
        subaccountJson.message || "Paystack error creating subaccount",
      );
    }

    let subaccount = subaccountJson.data || {};
    const paymentAccount = String(
      subaccount.subaccount_code ||
        existingSubaccountCode ||
        subaccount.id ||
        "",
    ).trim();

    if (!paymentAccount) {
      throw new Error("Paystack did not return a subaccount code");
    }

    if (existingSubaccountCode) {
      try {
        const detailsRes = await fetch(
          `https://api.paystack.co/subaccount/${encodeURIComponent(paymentAccount)}`,
          { headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` } },
        );
        const detailsJson = await detailsRes.json();
        if (
          detailsRes.ok &&
          detailsJson?.status === true &&
          detailsJson?.data
        ) {
          subaccount = detailsJson.data;
        }
      } catch (_fetchErr) {
        // Do not block successful creation on diagnostics fetch.
      }
    }

    const accountVerified = existingSubaccountCode
      ? getEffectiveVerificationState(subaccount)
      : false;

    const { error: updateVendorError } = await writeClient
      .from("chawp_vendors")
      .update({
        payment_platform: "paystack",
        payment_account: paymentAccount,
        account_code: accountNumberRaw,
        payment_provider: paymentMethod,
        payment_currency: currency,
        account_verified: accountVerified,
        subaccount_created_at: existingSubaccountCode
          ? vendor.subaccount_created_at
          : new Date().toISOString(),
      })
      .eq("id", vendor.id);

    if (updateVendorError) {
      throw new Error(updateVendorError.message || "failed_update_vendor");
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          vendor_id: vendor.id,
          mode,
          subaccount,
          payment_account: paymentAccount,
          account_verified: accountVerified,
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error) {
    console.error("create_subaccount error", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error?.message || "An unknown error occurred",
        diagnostics: {
          action: requestAction,
          key_mode: paystackKeyMode,
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      },
    );
  }
});
