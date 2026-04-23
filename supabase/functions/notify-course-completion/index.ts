import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendPlatformEmail } from "../_shared/smtp-sender.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { course_id, user_id } = await req.json();

    if (!course_id || !user_id) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: course, error: courseErr } = await supabaseAdmin
      .from("courses")
      .select("title, organization_id, notify_on_completion, completion_notify_emails, duration")
      .eq("id", course_id)
      .single();

    if (courseErr || !course) {
      return new Response(JSON.stringify({ error: "Course not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!course.notify_on_completion) {
      return new Response(JSON.stringify({ skipped: true, reason: "Notifications disabled" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("full_name, email")
      .eq("user_id", user_id)
      .single();

    const studentName = profile?.full_name || "Слушатель";

    const { data: org } = await supabaseAdmin
      .from("organizations")
      .select("name, email")
      .eq("id", course.organization_id)
      .single();

    if (!org) {
      return new Response(JSON.stringify({ error: "Organization not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: testLessons } = await supabaseAdmin
      .from("lessons")
      .select("id, title")
      .eq("course_id", course_id)
      .eq("type", "test")
      .order("order_index");

    const testResults: { lessonTitle: string; score: number; maxScore: number; percent: number }[] = [];
    let totalScore = 0;
    let totalMax = 0;

    if (testLessons && testLessons.length > 0) {
      const lessonIds = testLessons.map((l) => l.id);
      const { data: attempts } = await supabaseAdmin
        .from("test_attempts")
        .select("lesson_id, score, max_score, completed_at")
        .eq("user_id", user_id)
        .in("lesson_id", lessonIds)
        .order("completed_at", { ascending: false });

      const latestByLesson = new Map<string, { score: number; max_score: number }>();
      for (const a of attempts || []) {
        if (!latestByLesson.has(a.lesson_id)) {
          latestByLesson.set(a.lesson_id, { score: a.score, max_score: a.max_score });
        }
      }

      for (const lesson of testLessons) {
        const attempt = latestByLesson.get(lesson.id);
        if (attempt) {
          const percent = attempt.max_score > 0 ? Math.round((attempt.score / attempt.max_score) * 100) : 0;
          testResults.push({
            lessonTitle: lesson.title,
            score: attempt.score,
            maxScore: attempt.max_score,
            percent,
          });
          totalScore += attempt.score;
          totalMax += attempt.max_score;
        }
      }
    }

    const totalPercent = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;
    const completionDate = new Date().toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

    const testRowsHtml = testResults.length > 0
      ? testResults
          .map(
            (r) =>
              `<tr>
                <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; color: #334155;">${r.lessonTitle}</td>
                <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; text-align: center; font-weight: 600; color: #1e293b;">${r.score}/${r.maxScore}</td>
                <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; text-align: center;">
                  <span style="display: inline-block; padding: 2px 10px; border-radius: 12px; font-weight: 600; font-size: 13px; ${
                    r.percent >= 80
                      ? "background: #dcfce7; color: #166534;"
                      : r.percent >= 60
                      ? "background: #fef9c3; color: #854d0e;"
                      : "background: #fee2e2; color: #991b1b;"
                  }">${r.percent}%</span>
                </td>
              </tr>`
          )
          .join("")
      : `<tr><td colspan="3" style="padding: 14px; text-align: center; color: #94a3b8;">Тесты не проводились</td></tr>`;

    const htmlBody = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f1f5f9;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);">
      <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 32px; text-align: center;">
        <div style="font-size: 40px; margin-bottom: 8px;">🎓</div>
        <h1 style="margin: 0; font-size: 22px; font-weight: 700;">Курс завершён!</h1>
        <p style="margin: 8px 0 0 0; opacity: 0.9; font-size: 14px;">${org.name}</p>
      </div>
      <div style="padding: 32px;">
        <div style="background: #f8fafc; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
          <p style="margin: 0 0 8px 0; font-size: 14px; color: #64748b;">Слушатель</p>
          <p style="margin: 0; font-size: 18px; font-weight: 700; color: #0f172a;">${studentName}</p>
        </div>
        <div style="margin-bottom: 24px;">
          <p style="margin: 0 0 4px 0; font-size: 14px; color: #64748b;">Курс</p>
          <p style="margin: 0; font-size: 16px; font-weight: 600; color: #1e293b;">${course.title}</p>
          ${course.duration ? `<p style="margin: 4px 0 0 0; font-size: 13px; color: #94a3b8;">Длительность: ${course.duration}</p>` : ""}
          <p style="margin: 4px 0 0 0; font-size: 13px; color: #94a3b8;">Дата завершения: ${completionDate}</p>
        </div>
        <h3 style="margin: 0 0 12px 0; font-size: 15px; font-weight: 600; color: #334155;">Результаты тестирования</h3>
        <table style="width: 100%; border-collapse: collapse; border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0;">
          <thead>
            <tr style="background: #f8fafc;">
              <th style="padding: 10px 14px; text-align: left; font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Тест</th>
              <th style="padding: 10px 14px; text-align: center; font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Баллы</th>
              <th style="padding: 10px 14px; text-align: center; font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Результат</th>
            </tr>
          </thead>
          <tbody>${testRowsHtml}</tbody>
        </table>
        ${testResults.length > 0 ? `
        <div style="margin-top: 16px; background: linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%); border: 1px solid #bbf7d0; border-radius: 12px; padding: 16px; text-align: center;">
          <p style="margin: 0 0 4px 0; font-size: 13px; color: #166534;">Итоговый результат</p>
          <p style="margin: 0; font-size: 24px; font-weight: 700; color: #15803d;">${totalScore}/${totalMax} (${totalPercent}%)</p>
        </div>` : ""}
      </div>
      <div style="background: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0;">
        <p style="color: #94a3b8; font-size: 12px; margin: 0;">Это письмо отправлено автоматически системой обучения.</p>
      </div>
    </div>
  </div>
</body>
</html>`;

    const recipients: string[] = [];
    if (org.email) recipients.push(org.email);
    if (course.completion_notify_emails) {
      const extras = course.completion_notify_emails
        .split(",")
        .map((e: string) => e.trim())
        .filter((e: string) => e && e.includes("@"));
      recipients.push(...extras);
    }

    if (recipients.length === 0) {
      return new Response(JSON.stringify({ skipped: true, reason: "No recipients" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const subject = `Курс завершён: ${studentName} — ${course.title}`;
    let sent = 0;
    const errors: string[] = [];

    for (const recipient of recipients) {
      const res = await sendPlatformEmail({
        to: recipient,
        subject,
        html: htmlBody,
        skipRateLimit: true, // системные уведомления, не пользовательские
      });
      if (res.ok) {
        sent++;
      } else {
        errors.push(`${recipient}: ${res.error}`);
        console.error("notify-course-completion send error:", recipient, res.error);
      }
    }

    return new Response(
      JSON.stringify({ success: true, sent, total: recipients.length, errors: errors.length ? errors : undefined }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error in notify-course-completion:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
