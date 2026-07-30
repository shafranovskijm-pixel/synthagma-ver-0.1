// Edge Function: accept-staff-invitation
// Phase 5D.2 — принятие приглашения сотрудника.
//
// Ключевые правила:
//  - обычный сотрудник организации получает ТОЛЬКО строку org_staff
//    (никаких глобальных ролей, никакой перезаписи profiles.organization_id);
//  - роль 'owner' через приглашение запрещена (только OwnershipTransfer);
//  - организационное приглашение принимается атомарно через
//    service-role-only RPC accept_org_staff_invitation;
//  - verify_jwt = false, поэтому auth.getUser() проверяется вручную
//    ДО любых service-role действий.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Json = Record<string, unknown>;

const json = (status: number, body: Json) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const requestId = crypto.randomUUID();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json(401, {
        error: "Войдите в аккаунт, чтобы принять приглашение",
        code: "NO_SESSION",
        request_id: requestId,
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: authError } = await userClient.auth.getUser();
    if (authError || !userData?.user) {
      return json(401, {
        error: "Сессия истекла — войдите ещё раз",
        code: "SESSION_EXPIRED",
        request_id: requestId,
      });
    }
    const user = userData.user;
    const userEmail = (user.email || "").trim().toLowerCase();

    let body: Json = {};
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "Некорректный запрос", code: "BAD_REQUEST", request_id: requestId });
    }
    const token = typeof body.token === "string" ? body.token.trim() : "";
    if (!token) {
      return json(400, { error: "Не передан токен приглашения", code: "BAD_REQUEST", request_id: requestId });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: inv, error: invErr } = await admin
      .from("staff_invitations")
      .select("id, email, role, invitation_type, organization_id, company_id, invited_by, full_name, expires_at, accepted_at, accepted_user_id, status")
      .eq("token", token)
      .maybeSingle();

    if (invErr) {
      console.error(`[accept-staff-invitation][${requestId}] invitation lookup failed:`, invErr.message);
      return json(500, { error: "Внутренняя ошибка сервера", code: "INTERNAL", request_id: requestId });
    }
    if (!inv) {
      return json(404, { error: "Приглашение не найдено", code: "NOT_FOUND", request_id: requestId });
    }

    // -------- Organization staff: атомарно через RPC --------
    if (inv.invitation_type === "organization") {
      const { data: profile } = await admin
        .from("profiles")
        .select("full_name")
        .eq("user_id", user.id)
        .maybeSingle();

      const { data: rpcData, error: rpcError } = await admin.rpc("accept_org_staff_invitation", {
        _token: token,
        _user_id: user.id,
        _user_email: userEmail,
        _display_name: profile?.full_name || null,
      });

      if (rpcError) {
        console.error(`[accept-staff-invitation][${requestId}] rpc failed:`, rpcError.message);
        return json(500, { error: "Внутренняя ошибка сервера", code: "INTERNAL", request_id: requestId });
      }

      const result = (rpcData || {}) as { ok?: boolean; code?: string; message?: string; already?: boolean };
      if (!result.ok) {
        const code = result.code || "INTERNAL";
        const statusByCode: Record<string, number> = {
          NOT_FOUND: 404,
          ALREADY_ACCEPTED: 409,
          EXPIRED: 410,
          REVOKED: 410,
          EMAIL_MISMATCH: 403,
          OWNER_FORBIDDEN: 403,
          FORBIDDEN: 403,
          WRONG_TYPE: 400,
          BAD_REQUEST: 400,
        };
        return json(statusByCode[code] ?? 500, {
          error: result.message || "Не удалось принять приглашение",
          code,
          request_id: requestId,
          ...(code === "EMAIL_MISMATCH" ? { invitation_email: inv.email } : {}),
        });
      }

      return json(200, {
        success: true,
        already_accepted: !!result.already,
        redirect: "/organization",
        request_id: requestId,
      });
    }

    // -------- Остальные типы: admin / company / sales --------
    if (inv.accepted_at) {
      if (inv.accepted_user_id === user.id) {
        const redirect = inv.invitation_type === "admin" ? "/admin" : inv.invitation_type === "company" ? "/company" : "/sales";
        return json(200, { success: true, already_accepted: true, redirect, request_id: requestId });
      }
      return json(409, { error: "Приглашение уже принято", code: "ALREADY_ACCEPTED", request_id: requestId });
    }
    if (new Date(inv.expires_at).getTime() < Date.now()) {
      return json(410, { error: "Срок действия приглашения истёк", code: "EXPIRED", request_id: requestId });
    }
    if ((inv.status || "pending") !== "pending" && inv.status !== "sent") {
      return json(410, { error: "Приглашение отозвано", code: "REVOKED", request_id: requestId });
    }
    if (inv.invitation_type !== "sales" && userEmail !== (inv.email || "").toLowerCase()) {
      return json(403, {
        error: `Это приглашение отправлено на другой адрес (${inv.email}). Войдите под ним.`,
        code: "EMAIL_MISMATCH",
        invitation_email: inv.email,
        request_id: requestId,
      });
    }

    const { data: profile, error: profileErr } = await admin
      .from("profiles")
      .select("full_name, email")
      .eq("user_id", user.id)
      .maybeSingle();
    if (profileErr) {
      console.error(`[accept-staff-invitation][${requestId}] profile read failed:`, profileErr.message);
      return json(500, { error: "Внутренняя ошибка сервера", code: "INTERNAL", request_id: requestId });
    }
    const fullName = profile?.full_name || inv.full_name || userEmail;

    // Заменяем глобальную роль (user_roles уникален по user_id)
    const setGlobalRole = async (targetRole: "admin" | "company" | "sales_manager") => {
      const { error } = await admin
        .from("user_roles")
        .upsert({ user_id: user.id, role: targetRole } as any, { onConflict: "user_id" });
      if (error) throw new Error(`user_roles: ${error.message}`);
    };

    let redirectPath = "/";

    if (inv.invitation_type === "admin") {
      await setGlobalRole("admin");
      const { error } = await admin.from("admin_staff").upsert({
        user_id: user.id,
        email: userEmail,
        full_name: fullName,
        role: inv.role,
      } as any, { onConflict: "user_id" });
      if (error) throw new Error(`admin_staff: ${error.message}`);
      redirectPath = "/admin";

    } else if (inv.invitation_type === "company") {
      if (!inv.company_id) {
        return json(400, { error: "Приглашение оформлено некорректно", code: "BAD_REQUEST", request_id: requestId });
      }
      if (inv.role === "owner") {
        return json(403, {
          error: "Роль «Владелец» нельзя выдать через приглашение",
          code: "OWNER_FORBIDDEN",
          request_id: requestId,
        });
      }
      await setGlobalRole("company");
      const validRole = ["manager", "viewer"].includes(inv.role) ? inv.role : "viewer";
      const { error } = await admin.from("company_staff").upsert({
        company_id: inv.company_id,
        user_id: user.id,
        role: validRole,
        invited_by: inv.invited_by,
      } as any, { onConflict: "company_id,user_id" });
      if (error) throw new Error(`company_staff: ${error.message}`);
      redirectPath = "/company";

    } else if (inv.invitation_type === "sales") {
      await setGlobalRole("sales_manager");
      const { error: smErr } = await admin.from("sales_managers").upsert({
        user_id: user.id,
        full_name: fullName,
        is_active: true,
      } as any, { onConflict: "user_id" });
      if (smErr) throw new Error(`sales_managers: ${smErr.message}`);
      await admin.from("profiles").update({ full_name: fullName }).eq("user_id", user.id);
      redirectPath = "/sales";

    } else {
      return json(400, { error: "Неизвестный тип приглашения", code: "WRONG_TYPE", request_id: requestId });
    }

    const { error: markErr } = await admin
      .from("staff_invitations")
      .update({
        accepted_at: new Date().toISOString(),
        accepted_user_id: user.id,
        status: "accepted",
      })
      .eq("id", inv.id);
    if (markErr) {
      console.error(`[accept-staff-invitation][${requestId}] mark accepted failed:`, markErr.message);
      return json(500, { error: "Внутренняя ошибка сервера", code: "INTERNAL", request_id: requestId });
    }

    return json(200, { success: true, already_accepted: false, redirect: redirectPath, request_id: requestId });
  } catch (e) {
    console.error(`[accept-staff-invitation][${requestId}] error:`, (e as Error)?.message);
    return json(500, { error: "Внутренняя ошибка сервера", code: "INTERNAL", request_id: requestId });
  }
});
