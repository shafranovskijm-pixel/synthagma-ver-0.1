import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendPlatformEmail } from "../_shared/smtp-sender.ts";
import { notifyStudent, isPrefEnabled } from "../_shared/notification-prefs.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const STATUS_LABEL: Record<string, string> = {
  approved: "Выполнено ✅",
  revision: "На доработку 🔄",
  rejected: "Незачёт ❌",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { submission_id } = await req.json();
    if (!submission_id) {
      return new Response(JSON.stringify({ error: "submission_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: sub, error: subErr } = await admin
      .from("homework_submissions")
      .select("id, user_id, lesson_id, status, score, reviewer_comment")
      .eq("id", submission_id)
      .single();

    if (subErr || !sub) {
      return new Response(JSON.stringify({ error: "Submission not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: lesson } = await admin
      .from("lessons")
      .select("id, title, course_id, courses(title, organization_id)")
      .eq("id", sub.lesson_id)
      .single();

    const courseTitle = (lesson as any)?.courses?.title || "Курс";
    const lessonTitle = (lesson as any)?.title || "Урок";
    const statusLabel = STATUS_LABEL[sub.status] || sub.status;

    // In-app (gated by platform pref inside notifyStudent)
    await notifyStudent({
      userId: sub.user_id,
      type: "homework",
      title: `Проверено ДЗ: ${lessonTitle}`,
      message: `Статус: ${statusLabel}${sub.score != null ? ` · Балл: ${sub.score}` : ""}`,
      relatedId: (lesson as any)?.course_id ?? null,
    });

    // Email (gated by email pref, default OFF for homework)
    let emailSent = false;
    const allowEmail = await isPrefEnabled(sub.user_id, "homework", "email");
    if (allowEmail) {
      const { data: authUser } = await admin.auth.admin.getUserById(sub.user_id);
      const email = authUser?.user?.email;
      if (email) {
        const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background:#f1f5f9;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <div style="background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
      <div style="background:linear-gradient(135deg,#0891b2 0%,#0e7490 100%);color:white;padding:28px;text-align:center;">
        <div style="font-size:36px;margin-bottom:6px;">📝</div>
        <h1 style="margin:0;font-size:20px;font-weight:700;">Домашнее задание проверено</h1>
      </div>
      <div style="padding:28px;">
        <div style="background:#f8fafc;border-radius:12px;padding:16px;margin-bottom:20px;">
          <p style="margin:0 0 4px 0;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Курс</p>
          <p style="margin:0 0 10px 0;font-size:15px;font-weight:600;color:#0f172a;">${courseTitle}</p>
          <p style="margin:0 0 4px 0;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Урок</p>
          <p style="margin:0;font-size:15px;font-weight:600;color:#0f172a;">${lessonTitle}</p>
        </div>
        <div style="text-align:center;margin-bottom:20px;">
          <div style="font-size:20px;font-weight:700;color:#0f172a;">${statusLabel}</div>
          ${sub.score != null ? `<div style="margin-top:6px;font-size:14px;color:#64748b;">Балл: <strong style="color:#0f172a;">${sub.score}</strong></div>` : ""}
        </div>
        ${sub.reviewer_comment ? `
        <div style="background:#fefce8;border:1px solid #fde68a;border-radius:12px;padding:14px;">
          <p style="margin:0 0 6px 0;font-size:12px;font-weight:600;color:#854d0e;">Комментарий преподавателя:</p>
          <p style="margin:0;font-size:14px;color:#334155;white-space:pre-wrap;">${sub.reviewer_comment.replace(/[<>&]/g, (c: string) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!))}</p>
        </div>` : ""}
        <div style="text-align:center;margin-top:24px;">
          <a href="https://sintagma.com.ru/course/${(lesson as any)?.course_id ?? ""}"
             style="display:inline-block;background:#0891b2;color:white;padding:11px 24px;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px;">
            Открыть курс
          </a>
        </div>
      </div>
      <div style="background:#f8fafc;padding:14px;text-align:center;border-top:1px solid #e2e8f0;">
        <p style="color:#94a3b8;font-size:11px;margin:0;">Настроить уведомления: Профиль → Уведомления</p>
      </div>
    </div>
  </div>
</body></html>`;
        const r = await sendPlatformEmail({
          to: email,
          subject: `ДЗ проверено: ${lessonTitle}`,
          html,
          skipRateLimit: true,
        });
        emailSent = r.ok;
        if (!r.ok) console.error("homework email send error:", email, r.error);
      }
    }

    return new Response(JSON.stringify({ success: true, emailSent }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("notify-homework-graded error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
