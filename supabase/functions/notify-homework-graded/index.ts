import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendPlatformEmail } from "../_shared/smtp-sender.ts";
import { notifyStudent, isPrefEnabled } from "../_shared/notification-prefs.ts";
import { createHomeworkNotificationHandler } from "./handler.ts";

const STATUS_LABEL: Record<string, string> = { approved: "Выполнено ✅", revision: "На доработку 🔄", rejected: "Незачёт ❌" };
const escapeHtml = (value: string) => value.replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c] ?? ''));

serve(createHomeworkNotificationHandler({
  ordinary(bearer) {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_ANON_KEY");
    if (!url || !key) throw new Error('ordinary_client_unavailable');
    const client = createClient(url, key, {
      global: { headers: { Authorization: 'Bearer ' + bearer } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    let actor: string | null = null;
    return {
      async currentUser() {
        const { data, error } = await client.auth.getUser(bearer);
        actor = error || !data.user || data.user.is_anonymous === true ? null : data.user.id;
        return actor;
      },
      async readSubmission(id) {
        const { data, error } = await client.from('homework_submissions')
          .select('id,student_id,lesson_id,course_id,organization_id,status,score,reviewer_id,reviewer_comment,reviewed_at')
          .eq('id', id).maybeSingle();
        return error ? null : data;
      },
      async readScope(lessonId, courseId, studentId) {
        const [{ data: lesson, error: lessonError }, { data: course, error: courseError },
          { data: student, error: studentError }, { data: enrollment, error: enrollmentError }] = await Promise.all([
          client.from('lessons').select('id,course_id,title').eq('id', lessonId).eq('course_id', courseId).maybeSingle(),
          client.from('courses').select('id,organization_id,title').eq('id', courseId).maybeSingle(),
          client.from('profiles').select('user_id,organization_id,blocked_at,archived_at').eq('user_id', studentId).maybeSingle(),
          client.from('enrollments').select('id,user_id,course_id,status,expires_at').eq('user_id', studentId).eq('course_id', courseId).maybeSingle(),
        ]);
        if (lessonError || courseError || studentError || enrollmentError || !lesson || !course || !student || !enrollment
          || lesson.course_id !== course.id || student.user_id !== studentId || student.organization_id !== course.organization_id
          || student.blocked_at !== null || student.archived_at !== null || enrollment.user_id !== studentId || enrollment.course_id !== courseId
          || (enrollment.status !== 'active' && enrollment.status !== 'completed')) return null;
        if (enrollment.status !== 'completed' && enrollment.expires_at !== null
          && (!Number.isFinite(Date.parse(enrollment.expires_at)) || Date.parse(enrollment.expires_at) <= Date.now())) return null;
        return { lesson_id: lesson.id, course_id: course.id, organization_id: course.organization_id, lesson_title: lesson.title, course_title: course.title,
          student_id: student.user_id, student_organization_id: student.organization_id, enrollment_user_id: enrollment.user_id,
          enrollment_course_id: enrollment.course_id, enrollment_status: enrollment.status }; 
      },
      async canReview(courseId) {
        if (!actor) return false;
        const { data: profile, error: profileError } = await client.from('profiles')
          .select('user_id,blocked_at,archived_at').eq('user_id', actor).maybeSingle();
        if (profileError || !profile || profile.user_id !== actor || profile.blocked_at !== null || profile.archived_at !== null) return false;
        const { data, error } = await client.rpc('can_access_course', { _course_id: courseId, _permission: 'homework.write' });
        return !error && data === true;
      },
    };
  },
  async deliver(context) {
    // No service-role client or notification helper is reached before ordinary authorization.
    const sub = context.review;
    const statusLabel = STATUS_LABEL[sub.status];
    await notifyStudent({ userId: sub.student_id, type: 'homework', title: 'Проверено ДЗ: ' + context.lessonTitle,
      message: 'Статус: ' + statusLabel + (sub.score != null ? ' · Балл: ' + sub.score : ''), relatedId: sub.course_id });
    let emailSent = false;
    if (await isPrefEnabled(sub.student_id, 'homework', 'email')) {
      const url = Deno.env.get('SUPABASE_URL');
      const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (!url || !key) throw new Error('delivery_client_unavailable');
      const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data: authUser, error } = await admin.auth.admin.getUserById(sub.student_id);
      if (error || authUser?.user?.id !== sub.student_id) throw new Error('delivery_recipient_unavailable');
      const email = authUser?.user?.email;
      if (email) {
        const courseTitle = escapeHtml(context.courseTitle);
        const lessonTitle = escapeHtml(context.lessonTitle);
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
          <a href="https://xn--80aaiswd0ak.xn--p1ai/course/${sub.course_id}/learn"
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
        const r = await sendPlatformEmail({ to: email, subject: 'ДЗ проверено: ' + context.lessonTitle, html, skipRateLimit: true });
        emailSent = r.ok;
        if (!r.ok) throw new Error('email_delivery_failed');
      }
    }
    return { emailSent };
  },
}));
