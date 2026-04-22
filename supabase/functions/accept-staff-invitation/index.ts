// Edge Function: accept-staff-invitation
// Принимает токен приглашения и:
//  - валидирует (не истекло, не использовано),
//  - создаёт запись в admin_staff / org_staff / (company role) для текущего user,
//  - помечает приглашение как accepted.
// Требует, чтобы пользователь уже был залогинен (auth header).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Войдите в аккаунт, чтобы принять приглашение" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "Сессия истекла, войдите ещё раз" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const user = userData.user;

    const { token } = await req.json();
    if (!token) {
      return new Response(JSON.stringify({ error: "Не передан токен приглашения" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: inv, error: invErr } = await admin
      .from("staff_invitations")
      .select("*")
      .eq("token", token)
      .maybeSingle();

    if (invErr || !inv) {
      return new Response(JSON.stringify({ error: "Приглашение не найдено" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (inv.accepted_at) {
      return new Response(JSON.stringify({ error: "Приглашение уже принято" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (new Date(inv.expires_at).getTime() < Date.now()) {
      return new Response(JSON.stringify({ error: "Срок действия приглашения истёк" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Email пользователя должен совпадать с приглашением
    const userEmail = (user.email || "").toLowerCase();
    if (userEmail !== inv.email.toLowerCase()) {
      return new Response(JSON.stringify({
        error: `Это приглашение отправлено на адрес ${inv.email}. Войдите под этим email.`,
      }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Получим имя из profiles
    const { data: profile } = await admin
      .from("profiles")
      .select("full_name, email")
      .eq("user_id", user.id)
      .maybeSingle();
    const fullName = profile?.full_name || inv.full_name || userEmail;

    // В зависимости от типа приглашения создаём запись
    let redirectPath = "/";

    if (inv.invitation_type === "admin") {
      // Глобальная роль admin
      await admin.from("user_roles").upsert({
        user_id: user.id, role: "admin",
      } as any, { onConflict: "user_id,role" });

      const { error } = await admin.from("admin_staff").upsert({
        user_id: user.id,
        email: userEmail,
        full_name: fullName,
        role: inv.role,
      } as any, { onConflict: "user_id" });
      if (error) throw error;
      redirectPath = "/admin";

    } else if (inv.invitation_type === "organization") {
      if (!inv.organization_id) throw new Error("Не указана организация");
      // Привязываем профиль к организации (если ещё нет)
      await admin.from("profiles").update({
        organization_id: inv.organization_id,
      }).eq("user_id", user.id);

      const { error } = await admin.from("org_staff").upsert({
        organization_id: inv.organization_id,
        user_id: user.id,
        role: inv.role,
        display_name: fullName,
        sections_access: inv.sections_access || null,
        visibility: "all",
      } as any, { onConflict: "organization_id,user_id" });
      if (error) throw error;
      redirectPath = "/organization";

    } else if (inv.invitation_type === "company") {
      if (!inv.company_id) throw new Error("Не указана компания");
      // Глобальная роль company (на чтение раздела)
      await admin.from("user_roles").upsert({
        user_id: user.id, role: "company",
      } as any, { onConflict: "user_id,role" });
      // Этап 2: company_staff появится в Этапе 3.
      // Пока что: если у компании ещё нет владельца — назначаем текущего пользователя.
      const { data: company } = await admin
        .from("companies")
        .select("user_id")
        .eq("id", inv.company_id)
        .maybeSingle();
      if (company && !company.user_id) {
        await admin.from("companies").update({ user_id: user.id }).eq("id", inv.company_id);
      }
      redirectPath = "/company";
    }

    // Помечаем приглашение принятым
    await admin
      .from("staff_invitations")
      .update({
        accepted_at: new Date().toISOString(),
        accepted_user_id: user.id,
        status: 'accepted',
      })
      .eq("id", inv.id);

    return new Response(JSON.stringify({ success: true, redirect: redirectPath }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("accept-staff-invitation error:", e);
    return new Response(JSON.stringify({ error: e?.message || "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
