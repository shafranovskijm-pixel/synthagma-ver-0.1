import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function validateInn(inn: string): boolean {
  if (!/^\d+$/.test(inn)) return false;
  if (inn.length !== 10 && inn.length !== 12) return false;
  // Light validation; full checksum optional
  return true;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { token, inn, orgName, contactName, phone, redirectOrigin } = body;

    if (!token || !inn || !orgName) {
      return new Response(JSON.stringify({ error: "token, inn и orgName обязательны" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!validateInn(inn)) {
      return new Response(JSON.stringify({ error: "Неверный ИНН" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Look up the completion token (stored in nonce table)
    const { data: nonceRow, error: nonceErr } = await adminClient
      .from("yandex_oauth_nonces")
      .select("*")
      .eq("nonce", token)
      .maybeSingle();

    if (nonceErr || !nonceRow) {
      return new Response(JSON.stringify({ error: "Сессия регистрации истекла" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (nonceRow.used) {
      return new Response(JSON.stringify({ error: "Токен уже использован" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (new Date(nonceRow.expires_at).getTime() < Date.now()) {
      return new Response(JSON.stringify({ error: "Сессия истекла" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let yandexData: { yandex_id: string; email: string; login: string; name: string };
    try {
      yandexData = JSON.parse(nonceRow.redirect_to ?? "{}");
    } catch {
      return new Response(JSON.stringify({ error: "Битые данные сессии" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!yandexData.email) {
      return new Response(JSON.stringify({ error: "Нет email от Яндекс" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark nonce used
    await adminClient
      .from("yandex_oauth_nonces")
      .update({ used: true, used_at: new Date().toISOString() })
      .eq("id", nonceRow.id);

    // Create user
    const tempPassword = crypto.randomUUID();
    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      email: yandexData.email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: contactName ?? yandexData.name },
    });
    if (createErr || !created?.user) {
      console.error("[yandex-complete-org] createUser err:", createErr);
      return new Response(JSON.stringify({ error: "Не удалось создать пользователя" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = created.user.id;

    // Create organization
    const { data: orgRow, error: orgErr } = await adminClient
      .from("organizations")
      .insert({
        name: orgName,
        email: yandexData.email,
        phone: phone ?? null,
        inn,
        contact_name: contactName ?? yandexData.name,
        subscription_plan: "free",
        tariff_type: "free",
        is_paid: false,
        ai_enabled: false,
        storage_limit_bytes: 104857600,
        ai_tokens_limit: 0,
      })
      .select()
      .single();
    if (orgErr) {
      console.error("[yandex-complete-org] org create err:", orgErr);
      return new Response(JSON.stringify({ error: "Не удалось создать организацию" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Profile
    await adminClient.from("profiles").insert({
      user_id: userId,
      email: yandexData.email,
      full_name: contactName ?? yandexData.name,
      organization_id: orgRow.id,
    });

    // Role
    await adminClient.from("user_roles").insert({ user_id: userId, role: "organization" });

    // Yandex identity
    await adminClient.from("yandex_identities").insert({
      user_id: userId,
      yandex_id: yandexData.yandex_id,
      yandex_email: yandexData.email,
      yandex_login: yandexData.login,
      yandex_display_name: yandexData.name,
    });

    // Generate magic link to log them in
    const origin = redirectOrigin || "https://synthagma-bloom.lovable.app";
    const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
      type: "magiclink",
      email: yandexData.email,
      options: { redirectTo: `${origin}/auth/yandex/callback?status=signed_in` },
    });
    if (linkErr || !linkData?.properties?.action_link) {
      return new Response(JSON.stringify({ error: "Не удалось создать ссылку входа" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ success: true, loginUrl: linkData.properties.action_link }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[yandex-complete-org] error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
