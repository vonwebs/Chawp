// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ACTIVE_DELIVERY_STATUSES = [
  "confirmed",
  "preparing",
  "ready",
  "ready_for_pickup",
  "picked_up",
  "in_transit",
  "out_for_delivery",
];

const normalizeAction = (action: string, role: string): string => {
  const value = String(action || "").trim().toLowerCase();
  if (value) return value;

  const normalizedRole = String(role || "").toLowerCase();
  if (normalizedRole === "vendor") return "deactivate_vendor";
  if (normalizedRole === "delivery") return "deactivate_delivery";
  return "delete_customer";
};

const verifyPassword = async (
  supabaseUrl: string,
  anonKey: string,
  email: string,
  password: string,
) => {
  const authRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
    },
    body: JSON.stringify({ email, password }),
  });

  if (!authRes.ok) {
    throw new Error("Invalid password. Please try again.");
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      throw new Error("Supabase environment is not configured correctly");
    }

    const body = await req.json();
    const password = String(body?.password || "").trim();
    const reason = String(body?.reason || "").trim() || null;

    if (!password) {
      throw new Error("Password is required");
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: req.headers.get("Authorization") ?? "" },
      },
    });

    const writeClient = createClient(supabaseUrl, supabaseServiceRoleKey);

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      throw new Error("Authentication required");
    }

    if (!user.email) {
      throw new Error("Account email is required for password verification");
    }

    const { data: profile, error: profileError } = await writeClient
      .from("chawp_user_profiles")
      .select("id, role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      throw new Error(profileError.message || "Failed to load user profile");
    }

    const role = String(profile?.role || "user").toLowerCase();
    const action = normalizeAction(body?.action, role);

    await verifyPassword(supabaseUrl, supabaseAnonKey, user.email, password);

    if (action === "delete_customer") {
      const { error: deleteError } = await writeClient.auth.admin.deleteUser(user.id);
      if (deleteError) {
        throw new Error(deleteError.message || "Failed to delete customer account");
      }

      return new Response(
        JSON.stringify({
          success: true,
          action,
          message: "Customer account deleted successfully",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    if (action === "deactivate_vendor") {
      const { data: vendor, error: vendorError } = await writeClient
        .from("chawp_vendors")
        .select("id, deleted_at")
        .eq("user_id", user.id)
        .maybeSingle();

      if (vendorError) {
        throw new Error(vendorError.message || "Failed to load vendor profile");
      }

      if (!vendor) {
        throw new Error("Vendor profile not found");
      }

      if (!vendor.deleted_at) {
        const { error: updateVendorError } = await writeClient
          .from("chawp_vendors")
          .update({
            status: "inactive",
            operational_status: "closed",
            account_verified: false,
            deleted_at: new Date().toISOString(),
            deletion_reason: reason,
          })
          .eq("id", vendor.id);

        if (updateVendorError) {
          throw new Error(updateVendorError.message || "Failed to deactivate vendor account");
        }
      }

      const { error: profileUpdateError } = await writeClient
        .from("chawp_user_profiles")
        .update({ role: "user" })
        .eq("id", user.id)
        .eq("role", "vendor");

      if (profileUpdateError) {
        console.warn("Could not update vendor role after deactivation:", profileUpdateError);
      }

      return new Response(
        JSON.stringify({
          success: true,
          action,
          message: "Vendor account deactivated successfully",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    if (action === "deactivate_delivery") {
      const { data: delivery, error: deliveryError } = await writeClient
        .from("chawp_delivery_personnel")
        .select("id, deleted_at")
        .eq("user_id", user.id)
        .maybeSingle();

      if (deliveryError) {
        throw new Error(
          deliveryError.message || "Failed to load delivery personnel profile",
        );
      }

      if (!delivery) {
        throw new Error("Delivery profile not found");
      }

      const { count: activeDeliveriesCount, error: activeDeliveriesError } =
        await writeClient
          .from("chawp_orders")
          .select("id", { count: "exact", head: true })
          .eq("delivery_personnel_id", delivery.id)
          .in("status", ACTIVE_DELIVERY_STATUSES);

      if (activeDeliveriesError) {
        throw new Error(
          activeDeliveriesError.message || "Failed to check active deliveries",
        );
      }

      const { count: pendingEarningsCount, error: pendingEarningsError } =
        await writeClient
          .from("chawp_delivery_earnings")
          .select("id", { count: "exact", head: true })
          .eq("delivery_personnel_id", delivery.id)
          .eq("status", "pending");

      if (pendingEarningsError) {
        throw new Error(
          pendingEarningsError.message || "Failed to check pending earnings",
        );
      }

      if ((activeDeliveriesCount || 0) > 0) {
        throw new Error("You still have active deliveries. Complete them first.");
      }

      if ((pendingEarningsCount || 0) > 0) {
        throw new Error(
          "You still have pending earnings. Wait for payout before deletion.",
        );
      }

      if (!delivery.deleted_at) {
        const { error: deactivateError } = await writeClient
          .from("chawp_delivery_personnel")
          .update({
            is_available: false,
            is_active: false,
            is_verified: false,
            deleted_at: new Date().toISOString(),
            deletion_reason: reason,
          })
          .eq("id", delivery.id);

        if (deactivateError) {
          throw new Error(
            deactivateError.message || "Failed to deactivate delivery account",
          );
        }
      }

      const { error: profileUpdateError } = await writeClient
        .from("chawp_user_profiles")
        .update({ role: "user" })
        .eq("id", user.id)
        .eq("role", "delivery");

      if (profileUpdateError) {
        console.warn(
          "Could not update delivery role after deactivation:",
          profileUpdateError,
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          action,
          message: "Delivery account deactivated successfully",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    throw new Error(
      "Unsupported action. Use delete_customer, deactivate_vendor, or deactivate_delivery.",
    );
  } catch (error) {
    console.error("account-lifecycle error:", error);
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
