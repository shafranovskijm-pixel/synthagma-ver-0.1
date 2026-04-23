// Edge Function: process-document-expiry-reminders
// Для документов организации (org_documents): уведомления + email сотрудникам за 30/14/7/1 день до expires_at.
// Также автоматически переводит просроченные документы в статус "expired".

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendPlatformEmail } from "../_shared/smtp-sender.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const REMINDER_DAYS = [30, 14, 7, 1];

async function sendSmtp(to: string, subject: string, html: string): Promise<boolean> {
  const r = await sendPlatformEmail({ to, subject, html, skipRateLimit: true });
  if (!r.ok) console.error("SMTP send error:", r.error);
  return r.ok;
}

function buildEmail(opts: {
  documentName: string;
  documentType: string;
  expiresAt: string;
  daysLeft: number;
  responsiblePerson?: string | null;
  organizationName?: string | null;
}) {
  const { documentName, expiresAt, daysLeft, responsiblePerson, organizationName } = opts;
  const subject = `Документ «${documentName}» истекает через ${daysLeft} ${daysLeft === 1 ? "день" : "дн."}`;
  const html = `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f7fa;padding:32px 16px;color:#0f172a">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.05)">
      <div style="display:inline-block;padding:6px 12px;background:#fef3c7;color:#92400e;border-radius:8px;font-size:12px;font-weight:600;margin-bottom:16px">⚠️ Истекает срок</div>
      <h2 style="margin:0 0 16px;font-size:20px;font-weight:600">Документ требует обновления</h2>
      <p style="margin:0 0 8px;color:#475569;line-height:1.5">Документ <strong>«${documentName}»</strong> ${organizationName ? `организации <strong>${organizationName}</strong>` : ""} истекает через <strong>${daysLeft} ${daysLeft === 1 ? "день" : "дн."}</strong>.</p>
      <p style="margin:0 0 24px;color:#475569;line-height:1.5">Срок действия: <strong>${expiresAt}</strong>${responsiblePerson ? `<br>Ответственный: <strong>${responsiblePerson}</strong>` : ""}</p>
      <div style="background:#f8fafc;border-radius:12px;padding:16px;margin-bottom:24px;border-left:4px solid #f59e0b">
        <p style="margin:0;font-size:14px;color:#475569">Своевременно загрузите обновлённый документ в кабинет, чтобы избежать остановки работы организации.</p>
      </div>
      <p style="margin:0;font-size:12px;color:#94a3b8">Это автоматическое уведомление от Синтагма.</p>
    </div>
  </body></html>`;
  return { subject, html };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    // Auto-mark expired
    const { data: expiredDocs } = await supabase
      .from("org_documents")
      .select("id")
      .lt("expires_at", today.toISOString().split("T")[0])
      .eq("status", "active")
      .is("deleted_at", null);

    if (expiredDocs && expiredDocs.length > 0) {
      await supabase
        .from("org_documents")
        .update({ status: "expired" })
        .in("id", expiredDocs.map((d) => d.id));
    }

    let totalReminders = 0;
    let totalEmails = 0;

    for (const days of REMINDER_DAYS) {
      const target = new Date(today);
      target.setUTCDate(target.getUTCDate() + days);
      const targetStr = target.toISOString().split("T")[0];

      const { data: docs, error } = await supabase
        .from("org_documents")
        .select("id, organization_id, name, type, expires_at, reminder_sent_at, responsible_person")
        .eq("expires_at", targetStr)
        .eq("status", "active")
        .is("deleted_at", null);

      if (error) {
        console.error("query error:", error);
        continue;
      }
      if (!docs || docs.length === 0) continue;

      for (const doc of docs) {
        // Skip if already reminded today
        if (doc.reminder_sent_at) {
          const lastSent = new Date(doc.reminder_sent_at);
          lastSent.setUTCHours(0, 0, 0, 0);
          if (lastSent.getTime() === today.getTime()) continue;
        }

        // Получатели: org_staff + owner + emails из profiles
        const { data: staff } = await supabase
          .from("org_staff")
          .select("user_id")
          .eq("organization_id", doc.organization_id);

        const recipientIds = (staff || []).map((s) => s.user_id);

        const { data: owner } = await supabase
          .from("profiles")
          .select("user_id")
          .eq("organization_id", doc.organization_id)
          .limit(1)
          .maybeSingle();
        if (owner?.user_id && !recipientIds.includes(owner.user_id)) {
          recipientIds.push(owner.user_id);
        }

        // Org name для письма
        const { data: org } = await supabase
          .from("organizations")
          .select("name")
          .eq("id", doc.organization_id)
          .maybeSingle();

        // 1. In-app notifications
        for (const userId of recipientIds) {
          await supabase.from("org_notifications").insert({
            organization_id: doc.organization_id,
            user_id: userId,
            type: "document_expiry",
            title: `Документ истекает через ${days} дн.`,
            message: `«${doc.name}» истекает ${doc.expires_at}. ${doc.responsible_person ? `Ответственный: ${doc.responsible_person}` : ""}`.trim(),
            related_id: doc.id,
          });
        }
        totalReminders += recipientIds.length;

        // 2. Email-канал — для дней <=14 и <=7 и <=1 (наиболее срочные)
        if (recipientIds.length > 0 && days <= 14) {
          const { data: emailRecipients } = await supabase
            .from("profiles")
            .select("email")
            .in("user_id", recipientIds)
            .not("email", "is", null);

          const uniqueEmails = Array.from(new Set((emailRecipients || []).map((p: any) => p.email).filter(Boolean)));
          const { subject, html } = buildEmail({
            documentName: doc.name,
            documentType: doc.type,
            expiresAt: doc.expires_at,
            daysLeft: days,
            responsiblePerson: doc.responsible_person,
            organizationName: org?.name,
          });

          for (const email of uniqueEmails) {
            const ok = await sendSmtp(email, subject, html);
            if (ok) totalEmails++;
          }
        }

        await supabase
          .from("org_documents")
          .update({ reminder_sent_at: new Date().toISOString() })
          .eq("id", doc.id);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        expired_marked: expiredDocs?.length || 0,
        reminders_sent: totalReminders,
        emails_sent: totalEmails,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
