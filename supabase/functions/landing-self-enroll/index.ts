// Edge function: landing-self-enroll
// Анонимная функция для самозаписи учеников через форму на лендинге курса.
// Доступна без JWT, потому что лендинги публичные.
// Создаёт пользователя, профиль, роль student, зачисление и (опц.) шлёт пароль.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Payload {
  course_id: string;
  full_name: string;
  email: string;
  phone?: string;
  extra?: Record<string, string>;
  consent: boolean;
  source?: string | null;
  utm?: Record<string, string>;
  landing_referrer?: string | null;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function generatePassword(): string {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let pwd = "";
  for (let i = 0; i < 10; i++) pwd += chars.charAt(Math.floor(Math.random() * chars.length));
  return pwd;
}

async function generateLogin(admin: any): Promise<string> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const num = Math.floor(10000 + Math.random() * 90000);
    const login = `student_${num}`;
    const { data: existing } = await admin.from("profiles").select("id").eq("login", login).maybeSingle();
    if (!existing) return login;
  }
  return `student_${Date.now()}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // ── Rate limit: 5 попыток / минуту с одного IP ─────────────
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = checkRateLimit(`self-enroll:${ip}`, { maxRequests: 5, windowSeconds: 60 });
  if (!rl.allowed) return rateLimitResponse(rl, corsHeaders);

  try {
    const body = await req.json() as Payload;

    // ── Валидация ──────────────────────────────────────────────
    if (!body?.course_id || typeof body.course_id !== "string") return json({ error: "course_id required" }, 400);
    if (!body?.full_name || body.full_name.trim().length < 2) return json({ error: "full_name required" }, 400);
    if (body.full_name.length > 255) return json({ error: "full_name too long" }, 400);

    const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
    if (!body?.email || !emailRegex.test(body.email)) return json({ error: "Valid email required" }, 400);
    if (body.email.length > 255) return json({ error: "email too long" }, 400);

    if (!body?.consent) return json({ error: "Согласие на обработку персональных данных обязательно" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // ── Проверяем курс ─────────────────────────────────────────
    const { data: course, error: courseError } = await admin
      .from("courses")
      .select("id, organization_id, is_published, landing_content, default_access_days")
      .eq("id", body.course_id)
      .maybeSingle();

    if (courseError) {
      console.error("course lookup err:", courseError);
      return json({ error: "Не удалось проверить курс." }, 500);
    }

    if (!course || !course.is_published) return json({ error: "Курс не найден или не опубликован" }, 404);

    const enrollmentCfg = (course.landing_content as any)?.enrollment ?? {};
    const mode = enrollmentCfg.mode ?? "request";
    if (mode !== "instant") {
      return json({ error: "Самозачисление для этого курса не включено" }, 403);
    }
    const studentGroupId: string | null = enrollmentCfg.student_group_id ?? null;
    const sendEmail: boolean = enrollmentCfg.send_credentials_email !== false;

    // ── Организация (метаданные для уведомлений/писем) ─────────
    const { data: orgData } = await admin
      .from("organizations")
      .select("name, telegram_notify_enabled, telegram_notify_chat_id")
      .eq("id", course.organization_id)
      .maybeSingle();

    // ── Existing profile in same org → idempotent, no new slot ──
    const normalizedEmail = body.email.trim().toLowerCase();
    const { data: existingProfile, error: existingProfileError } = await admin
      .from("profiles")
      .select("user_id, organization_id, archived_at")
      .eq("email", normalizedEmail)
      .eq("organization_id", course.organization_id)
      .maybeSingle();

    if (existingProfileError) {
      console.error("existing profile lookup err:", existingProfileError);
      return json({ error: "Не удалось проверить существующую учётную запись." }, 500);
    }

    // Do NOT reveal PII to anonymous callers: no login/password returned
    // for existing accounts; just proceed to enroll them silently.
    let userId: string;
    let createdNew = false;
    let login = "";
    let password = "";

    const rollbackCreatedUser = async () => {
      if (!createdNew) return;
      try {
        const { error: rollbackError } = await admin.auth.admin.deleteUser(userId);
        if (rollbackError) console.error("enrollment rollback err:", rollbackError);
      } catch (rollbackError) {
        console.error("enrollment rollback exception:", rollbackError);
      }
    };

    if (existingProfile) {
      if (existingProfile.archived_at) {
        return json({ error: "Ваша учётная запись отключена. Обратитесь к администратору школы." }, 403);
      }
      userId = existingProfile.user_id;
    } else {
      // ── Server-canonical capacity preflight (read-only) ─────
      const { data: capacityRow, error: capacityError } = await admin.rpc(
        "get_organization_student_capacity",
        { p_organization_id: course.organization_id, p_requested_count: 1 },
      );
      if (capacityError) {
        console.error("capacity lookup err:", capacityError);
        return json({ error: "Не удалось проверить вместимость организации." }, 500);
      }
      const capacity: any = Array.isArray(capacityRow) ? capacityRow[0] : capacityRow;
      if (capacity && !capacity.is_unlimited && !capacity.can_add) {
        return json({
          error: "Достигнут лимит учеников у организации. Обратитесь к администратору школы.",
          code: "STUDENT_LIMIT_EXCEEDED",
        }, 409);
      }

      // Create auth-user
      login = await generateLogin(admin);
      password = generatePassword();
      const authEmail = `${login}@student.local`;

      const { data: authData, error: authErr } = await admin.auth.admin.createUser({
        email: authEmail,
        password,
        email_confirm: true,
        user_metadata: { full_name: body.full_name },
      });
      if (authErr || !authData.user) {
        return json({ error: "Не удалось создать пользователя: " + (authErr?.message ?? "unknown") }, 500);
      }
      userId = authData.user.id;

      // Atomic capacity claim + profile + role
      const { data: claimRes, error: claimErr } = await admin.rpc(
        "create_student_profile_with_capacity",
        {
          p_organization_id: course.organization_id,
          p_user_id: userId,
          p_full_name: body.full_name.trim(),
          p_email: normalizedEmail,
          p_login: login,
          p_generated_password: password,
          p_company_id: null,
          p_student_group_id: studentGroupId,
          p_region: null,
        },
      );

      const claim: any = claimRes;
      if (claimErr || !claim || !claim.success) {
        // Rollback the auth-user we just created.
        try { await admin.auth.admin.deleteUser(userId); } catch {}
        console.error("claim err:", claimErr, claim);
        if (claim?.code === "STUDENT_LIMIT_EXCEEDED") {
          return json({
            error: "Достигнут лимит учеников у организации. Обратитесь к администратору школы.",
            code: "STUDENT_LIMIT_EXCEEDED",
          }, 409);
        }
        return json({ error: "Ошибка регистрации: " + (claim?.message || claimErr?.message || "unknown") }, 500);
      }

      createdNew = true;
    }

    // ── Зачисление ─────────────────────────────────────────────
    const { data: existingEnroll, error: existingEnrollError } = await admin
      .from("enrollments")
      .select("id")
      .eq("user_id", userId)
      .eq("course_id", course.id)
      .maybeSingle();

    if (existingEnrollError) {
      console.error("existing enrollment lookup err:", existingEnrollError);
      await rollbackCreatedUser();
      return json({ error: "Не удалось проверить зачисление." }, 500);
    }

    let enrolled = false;
    if (!existingEnroll) {
      const accessDays = course.default_access_days ?? null;
      const expiresAt = accessDays ? new Date(Date.now() + accessDays * 86_400_000).toISOString() : null;
      const { data: insertedEnrollment, error: enrErr } = await admin
        .from("enrollments")
        .insert({
          user_id: userId,
          course_id: course.id,
          status: "active",
          progress: 0,
          access_days: accessDays,
          expires_at: expiresAt,
        })
        .select("id, user_id, course_id")
        .maybeSingle();
      if (
        enrErr
        || !insertedEnrollment
        || insertedEnrollment.user_id !== userId
        || insertedEnrollment.course_id !== course.id
      ) {
        console.error("enroll err:", enrErr);
        await rollbackCreatedUser();
        return json({ error: "Ошибка зачисления: база не подтвердила вставку." }, 500);
      }

      const { data: persistedEnrollment, error: verificationError } = await admin
        .from("enrollments")
        .select("id, user_id, course_id")
        .eq("id", insertedEnrollment.id)
        .eq("user_id", userId)
        .eq("course_id", course.id)
        .maybeSingle();
      if (
        verificationError
        || !persistedEnrollment
        || persistedEnrollment.id !== insertedEnrollment.id
      ) {
        console.error("enrollment verification err:", verificationError);
        await rollbackCreatedUser();
        return json({ error: "Ошибка зачисления: база не подтвердила сохранение." }, 500);
      }
      enrolled = true;
    }

    // ── Согласие на ПД ─────────────────────────────────────────
    try {
      await admin.from("student_consents").insert({
        organization_id: course.organization_id,
        user_id: userId,
        consent_type: "personal_data",
        full_name: body.full_name.trim(),
        email: body.email.toLowerCase(),
        phone: body.phone ?? null,
        signed_at: new Date().toISOString(),
        ip_address: ip,
        user_agent: req.headers.get("user-agent") ?? null,
      });
    } catch (e) {
      console.warn("consent log skip:", e);
    }

    // ── Email с паролем (только новым пользователям) ──────────
    let emailSent = false;
    if (createdNew && sendEmail) {
      try {
        const { error: mailErr } = await admin.functions.invoke("send-credentials", {
          body: {
            email: body.email,
            full_name: body.full_name,
            login,
            password,
            organization_name: (orgData as any)?.name ?? "ваша школа",
            course_id: course.id,
          },
        });
        if (!mailErr) emailSent = true;
        else console.warn("send-credentials err:", mailErr);
      } catch (e) {
        console.warn("send-credentials invoke err:", e);
      }
    }

    // ── Лид-магнит (PDF) на email — best-effort ───────────────
    const leadMagnetUrl: string | undefined = enrollmentCfg.lead_magnet_url;
    const leadMagnetLabel: string | undefined = enrollmentCfg.lead_magnet_label;
    if (leadMagnetUrl) {
      try {
        await admin.functions.invoke("send-lead-magnet", {
          body: {
            email: body.email,
            full_name: body.full_name,
            organization_name: (orgData as any)?.name ?? "Школа",
            file_url: leadMagnetUrl,
            file_label: leadMagnetLabel ?? "Подарок",
          },
        });
      } catch (e) {
        console.warn("send-lead-magnet invoke err:", e);
      }
    }

    // ── Telegram-уведомление организации — best-effort ────────
    const tgEnabled = (orgData as any)?.telegram_notify_enabled === true;
    const tgChatId = (orgData as any)?.telegram_notify_chat_id;
    if (enrollmentCfg.notify_telegram !== false && tgEnabled && tgChatId) {
      try {
        const courseTitle = ((course as any).landing_content?.hero?.title) || "(без названия)";
        const utmStr = body.utm && Object.keys(body.utm).length > 0
          ? `\n<b>UTM:</b> ${Object.entries(body.utm).map(([k, v]) => `${k}=${v}`).join(", ")}`
          : "";
        const sourceStr = body.source ? `\n<b>Источник:</b> ${body.source}` : "";
        const message = `🎓 <b>Новая регистрация на лендинге</b>\n\n` +
          `<b>Курс:</b> ${courseTitle}\n` +
          `<b>Имя:</b> ${body.full_name}\n` +
          `<b>Email:</b> ${body.email}\n` +
          (body.phone ? `<b>Телефон:</b> ${body.phone}\n` : "") +
          `<b>Режим:</b> мгновенное зачисление` +
          sourceStr + utmStr;
        await admin.functions.invoke("send-telegram-notification", {
          body: { chat_id: tgChatId, message },
        });
      } catch (e) {
        console.warn("telegram notify err:", e);
      }
    }

    return json({
      ok: true,
      created_new: createdNew,
      enrolled,
      email_sent: emailSent,
      message: createdNew
        ? emailSent
          ? "Вы успешно зарегистрированы и зачислены на курс. Логин и пароль отправлены на почту."
          : "Вы успешно зарегистрированы и зачислены на курс. Для получения данных для входа обратитесь к администратору школы."
        : "Вы зачислены на курс. Войдите под существующей учётной записью.",
    });
  } catch (e: any) {
    console.error("landing-self-enroll error:", e);
    return json({ error: e?.message ?? "Internal error" }, 500);
  }
});
