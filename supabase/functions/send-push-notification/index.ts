// Supabase Edge Function to send push notifications via Firebase Cloud Messaging V1 API (FCM-only)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type PushResult = {
  token: string;
  success: boolean;
  messageId?: string;
  error?: string;
};

const EXPO_PUSH_REGEX = /^(ExponentPushToken|ExpoPushToken)\[/;

function isLikelyInvalidFcmTokenError(message: string): boolean {
  const normalized = (message || "").toLowerCase();
  return (
    normalized.includes("requested entity was not found") ||
    normalized.includes("registration token is not valid") ||
    normalized.includes("not registered") ||
    normalized.includes("unregistered")
  );
}

// Function to get OAuth2 access token from service account
async function getAccessToken(serviceAccount: any): Promise<string> {
  const jwtHeader = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));

  const now = Math.floor(Date.now() / 1000);
  const jwtClaimSet = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };
  const jwtClaimSetEncoded = btoa(JSON.stringify(jwtClaimSet));

  const signatureInput = `${jwtHeader}.${jwtClaimSetEncoded}`;

  // Import private key
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(serviceAccount.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  // Sign the JWT
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(signatureInput),
  );

  const jwtSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

  const jwt = `${signatureInput}.${jwtSignature}`;

  // Exchange JWT for access token
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const tokenData = await response.json();
  return tokenData.access_token;
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function sendFcmNotification(
  token: string,
  title: string,
  body: string,
  data: Record<string, string>,
  sound: string,
  priority: string,
  accessToken: string,
  projectId: string,
): Promise<PushResult> {
  const message = {
    message: {
      token,
      notification: {
        title,
        body,
      },
      data,
      android: {
        priority: priority === "high" ? "high" : "normal",
        notification: {
          sound,
          channelId: data?.channelId || "default",
        },
      },
      apns: {
        headers: {
          "apns-priority": priority === "high" ? "10" : "5",
        },
        payload: {
          aps: {
            sound,
          },
        },
      },
    },
  };

  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    },
  );

  const result = await response.json();

  if (!response.ok) {
    return {
      token,
      success: false,
      error: result.error?.message || "Unknown FCM error",
    };
  }

  return {
    token,
    success: true,
    messageId: result.name,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const {
      tokens,
      title,
      body,
      data,
      sound = "default",
      priority = "high",
    } = await req.json();

    if (!tokens || tokens.length === 0) {
      throw new Error("No tokens provided");
    }

    if (!title || !body) {
      throw new Error("Title and body are required");
    }

    const normalizedData: Record<string, string> = {};
    if (data && typeof data === "object") {
      for (const [key, value] of Object.entries(data)) {
        normalizedData[key] = String(value ?? "");
      }
    }

    const validTokens = (tokens as string[]).filter(
      (token) => typeof token === "string" && token.length > 0,
    );
    const expoTokens = validTokens.filter((token) => EXPO_PUSH_REGEX.test(token));
    const fcmTokens = validTokens.filter((token) => !EXPO_PUSH_REGEX.test(token));

    console.log(
      `Sending notifications (FCM-only). Total: ${validTokens.length}, Expo: ${expoTokens.length}, FCM: ${fcmTokens.length}`,
    );

    if (expoTokens.length > 0) {
      console.warn(
        `FCM-only mode: ignoring ${expoTokens.length} Expo token(s) in request`,
      );
    }

    if (fcmTokens.length === 0) {
      throw new Error("No FCM-compatible tokens provided. Expo tokens are not supported in FCM-only mode.");
    }

    const results: PushResult[] = [];

    let projectIdUsed: string | null = null;

    if (fcmTokens.length > 0) {
      // Get Firebase service account from environment only when needed for FCM.
      const serviceAccountJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
      if (!serviceAccountJson) {
        throw new Error("FIREBASE_SERVICE_ACCOUNT not configured in environment");
      }

      const serviceAccount = JSON.parse(serviceAccountJson);
      const projectId = serviceAccount.project_id;
      projectIdUsed = projectId;
      const accessToken = await getAccessToken(serviceAccount);

      for (const token of fcmTokens) {
        const fcmResult = await sendFcmNotification(
          token,
          title,
          body,
          normalizedData,
          sound,
          priority,
          accessToken,
          projectId,
        );
        results.push(fcmResult);
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.filter((r) => !r.success).length;
    const failedReasons = results
      .filter((r) => !r.success)
      .map((r) => ({ token: r.token, error: r.error || "Unknown error" }));
    const invalidTokens = results
      .filter((r) => !r.success && isLikelyInvalidFcmTokenError(r.error || ""))
      .map((r) => r.token);

    console.log(
      `Push notifications sent: ${successCount} succeeded, ${failureCount} failed`,
    );

    if (projectIdUsed) {
      console.log(`FCM project used: ${projectIdUsed}`);
    }

    if (failureCount > 0) {
      console.log(
        "Push notification failure details:",
        JSON.stringify(failedReasons.slice(0, 10)),
      );

      if (invalidTokens.length > 0) {
        console.warn(
          `Detected ${invalidTokens.length} invalid/unregistered FCM token(s). These should be removed from DB.`,
        );
      }
    }

    return new Response(
      JSON.stringify({
        success: successCount > 0,
        results,
        failedReasons,
        invalidTokens,
        summary: {
          total: validTokens.length,
          succeeded: successCount,
          failed: failureCount,
          invalidTokenCount: invalidTokens.length,
          fcmProjectId: projectIdUsed,
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error) {
    console.error("Error sending push notifications:", error);
    const errorMessage =
      error instanceof Error ? error.message : "An error occurred";
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      },
    );
  }
});
