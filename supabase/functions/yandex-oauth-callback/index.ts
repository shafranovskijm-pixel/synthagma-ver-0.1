import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface YandexUserInfo {
  id: string;
  default_email?: string;
  emails?: string[];
  login?: string;
  display_name?: string;
  real_name?: string;
  first_name?: string;
  last_name?: string;
}

function getAppOrigin(req: Request): string {
  // Custom domain or lovable preview — fallback to publish URL
  const referer = req.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch (_e) {
      /* ignore */
    }
  }
  return "https://synthagma-bloom.lovable.app";
}

function buildCallbackRedirect(origin: string, params: Record<string, string>): string {
  const url = new URL(`${origin}/auth/yandex/callback`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.toString();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const origin = getAppOrigin(req);
  const reqUrl = new URL(req.url);
  const code = reqUrl.searchParams.get("code");
  const state = reqUrl.searchParams.get("state");
  const errorParam = reqUrl.searchParams.get("error");

  // Yandex returned error
  if (errorParam) {
    return Response.redirect(
      buildCallbackRedirect(origin, { status: "error", message: errorParam }),
      302
    );
  }

  if (!code || !state) {
    return Response.redirect(
      buildCallbackRedirect(origin, { status: "error", message: "missing_code_or_state" }),
      302
    );
  }

  const clientId = Deno.env.get("YANDEX_OAUTH_CLIENT_ID");
  const clientSecret = Deno.env.get("YANDEX_OAUTH_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    return Response.redirect(
      buildCallbackRedirect(origin, { status: "error", message: "oauth_not_configured" }),
      302
    );
  }

  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  // Validate nonce
  const { data: nonceRow, error: nonceErr } = await adminClient
    .from("yandex_oauth_nonces")
    .select("*")
    .eq("nonce", state)
    .maybeSingle();

  if (nonceErr || !nonceRow) {
    return Response.redirect(
      buildCallbackRedirect(origin, { status: "error", message: "invalid_state" }),
      302
    );
  }
  if (nonceRow.used) {
    return Response.redirect(
      buildCallbackRedirect(origin, { status: "error", message: "state_already_used" }),
      302
    );
  }
  if (new Date(nonceRow.expires_at).getTime() < Date.now()) {
    return Response.redirect(
      buildCallbackRedirect(origin, { status: "error", message: "state_expired" }),
      302
    );
  }

  // Mark nonce as used
  await adminClient
    .from("yandex_oauth_nonces")
    .update({ used: true, used_at: new Date().toISOString() })
    .eq("id", nonceRow.id);

  const mode = nonceRow.mode as "login" | "link" | "signup-org" | "signup-student";

  // Exchange code for token
  const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/yandex-oauth-callback`;
  const tokenResp = await fetch("https://oauth.yandex.ru/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenResp.ok) {
    const txt = await tokenResp.text();
    console.error("[yandex-callback] token exchange failed:", txt);
    return Response.redirect(
      buildCallbackRedirect(origin, { status: "error", message: "token_exchange_failed" }),
      302
    );
  }
  const tokenData = await tokenResp.json();
  const accessToken = tokenData.access_token as string;

  // Fetch user info
  const userResp = await fetch("https://login.yandex.ru/info?format=json", {
    headers: { Authorization: `OAuth ${accessToken}` },
  });
  if (!userResp.ok) {
    return Response.redirect(
      buildCallbackRedirect(origin, { status: "error", message: "user_info_failed" }),
      302
    );
  }
  const yUser = (await userResp.json()) as YandexUserInfo;
  const yandexId = yUser.id;
  const yandexEmail = yUser.default_email ?? yUser.emails?.[0] ?? null;
  const yandexLogin = yUser.login ?? null;
  const yandexName = yUser.real_name ?? yUser.display_name ?? `${yUser.first_name ?? ""} ${yUser.last_name ?? ""}`.trim();

  if (!yandexId) {
    return Response.redirect(
      buildCallbackRedirect(origin, { status: "error", message: "no_yandex_id" }),
      302
    );
  }

  // Look up existing identity
  const { data: existingIdentity } = await adminClient
    .from("yandex_identities")
    .select("*")
    .eq("yandex_id", yandexId)
    .maybeSingle();

  // ============ LINK MODE ============
  if (mode === "link") {
    const currentUserId = nonceRow.current_user_id as string | null;
    if (!currentUserId) {
      return Response.redirect(
        buildCallbackRedirect(origin, { status: "error", message: "no_current_user" }),
        302
      );
    }

    if (existingIdentity && existingIdentity.user_id !== currentUserId) {
      return Response.redirect(
        buildCallbackRedirect(origin, {
          status: "error",
          message: "yandex_already_linked",
        }),
        302
      );
    }

    if (!existingIdentity) {
      // Check if this user already has a different yandex linked
      const { data: userExisting } = await adminClient
        .from("yandex_identities")
        .select("id")
        .eq("user_id", currentUserId)
        .maybeSingle();
      if (userExisting) {
        return Response.redirect(
          buildCallbackRedirect(origin, { status: "error", message: "user_already_has_yandex" }),
          302
        );
      }
      const { error: insErr } = await adminClient.from("yandex_identities").insert({
        user_id: currentUserId,
        yandex_id: yandexId,
        yandex_email: yandexEmail,
        yandex_login: yandexLogin,
        yandex_display_name: yandexName,
      });
      if (insErr) {
        console.error("[yandex-callback] link insert err:", insErr);
        return Response.redirect(
          buildCallbackRedirect(origin, { status: "error", message: "link_failed" }),
          302
        );
      }
    }

    return Response.redirect(
      buildCallbackRedirect(origin, {
        status: "linked",
        email: yandexEmail ?? "",
        redirect: nonceRow.redirect_to ?? "",
      }),
      302
    );
  }

  // ============ LOGIN MODE ============
  if (mode === "login") {
    if (!existingIdentity) {
      return Response.redirect(
        buildCallbackRedirect(origin, {
          status: "not_linked",
          email: yandexEmail ?? "",
        }),
        302
      );
    }

    // Get user's email to generate magic link
    const { data: userData, error: userErr } = await adminClient.auth.admin.getUserById(
      existingIdentity.user_id
    );
    if (userErr || !userData?.user?.email) {
      return Response.redirect(
        buildCallbackRedirect(origin, { status: "error", message: "user_email_missing" }),
        302
      );
    }

    const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
      type: "magiclink",
      email: userData.user.email,
      options: { redirectTo: `${origin}/auth/yandex/callback?status=signed_in` },
    });
    if (linkErr || !linkData?.properties?.action_link) {
      console.error("[yandex-callback] generateLink err:", linkErr);
      return Response.redirect(
        buildCallbackRedirect(origin, { status: "error", message: "magiclink_failed" }),
        302
      );
    }
    return Response.redirect(linkData.properties.action_link, 302);
  }

  // ============ SIGNUP-ORG MODE ============
  if (mode === "signup-org") {
    if (existingIdentity) {
      // Already has account — log them in
      const { data: userData } = await adminClient.auth.admin.getUserById(existingIdentity.user_id);
      if (userData?.user?.email) {
        const { data: linkData } = await adminClient.auth.admin.generateLink({
          type: "magiclink",
          email: userData.user.email,
          options: { redirectTo: `${origin}/auth/yandex/callback?status=signed_in` },
        });
        if (linkData?.properties?.action_link) {
          return Response.redirect(linkData.properties.action_link, 302);
        }
      }
    }

    // Need to collect INN — pass yandex data to complete-org page via temp token
    const completionToken = crypto.randomUUID();
    await adminClient.from("yandex_oauth_nonces").insert({
      nonce: completionToken,
      mode: "signup-org",
      current_user_id: null,
      redirect_to: JSON.stringify({
        yandex_id: yandexId,
        email: yandexEmail,
        login: yandexLogin,
        name: yandexName,
      }),
    });

    return Response.redirect(
      buildCallbackRedirect(origin, {
        status: "need_inn",
        token: completionToken,
        email: yandexEmail ?? "",
        name: yandexName ?? "",
      }),
      302
    );
  }

  // ============ SIGNUP-STUDENT MODE ============
  if (mode === "signup-student") {
    if (existingIdentity) {
      const { data: userData } = await adminClient.auth.admin.getUserById(existingIdentity.user_id);
      if (userData?.user?.email) {
        const { data: linkData } = await adminClient.auth.admin.generateLink({
          type: "magiclink",
          email: userData.user.email,
          options: { redirectTo: `${origin}/auth/yandex/callback?status=signed_in` },
        });
        if (linkData?.properties?.action_link) {
          return Response.redirect(linkData.properties.action_link, 302);
        }
      }
    }

    if (!yandexEmail) {
      return Response.redirect(
        buildCallbackRedirect(origin, { status: "error", message: "no_email_from_yandex" }),
        302
      );
    }

    // Auto-create student account
    const tempPassword = crypto.randomUUID();
    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      email: yandexEmail,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: yandexName },
    });
    if (createErr || !created?.user) {
      console.error("[yandex-callback] createUser err:", createErr);
      return Response.redirect(
        buildCallbackRedirect(origin, { status: "error", message: "create_user_failed" }),
        302
      );
    }

    await adminClient.from("yandex_identities").insert({
      user_id: created.user.id,
      yandex_id: yandexId,
      yandex_email: yandexEmail,
      yandex_login: yandexLogin,
      yandex_display_name: yandexName,
    });

    await adminClient.from("user_roles").insert({ user_id: created.user.id, role: "student" });
    await adminClient.from("profiles").insert({
      user_id: created.user.id,
      email: yandexEmail,
      full_name: yandexName,
    });

    const { data: linkData } = await adminClient.auth.admin.generateLink({
      type: "magiclink",
      email: yandexEmail,
      options: { redirectTo: `${origin}/auth/yandex/callback?status=signed_in` },
    });
    if (linkData?.properties?.action_link) {
      return Response.redirect(linkData.properties.action_link, 302);
    }
    return Response.redirect(
      buildCallbackRedirect(origin, { status: "error", message: "magiclink_failed" }),
      302
    );
  }

  return Response.redirect(
    buildCallbackRedirect(origin, { status: "error", message: "unknown_mode" }),
    302
  );
});
