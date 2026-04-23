// Edge Function: process-signature-expiry-reminders
// Отправляет email-напоминания получателям ПЭП о приближении срока подписания.
// Этапы напоминаний: за 7, 3 и 1 день до expires_at. Один email на этап на документ.
// Также автоматически переводит просроченные подписания в статус "expired".

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendPlatformEmail } from "../_shared/smtp-sender.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const REMINDER_DAYS = [7, 3, 1] as const;

async function sendSmtp(to: string, subject: string, html: string): Promise<boolean> {
  const r = await sendPlatformEmail({ to, subject, html, skipRateLimit: true });
  if (!r.ok) console.error("SMTP send error:", r.error);
  return r.ok;
}

function buildEmail(opts: {
  recipientName: string;
  documentTitle: string;
  daysLeft: number;
  signUrl: string;
  senderName?: string;
}): { subject: string; html: string } {
  const { recipientName, documentTitle, daysLeft, signUrl, senderName } = opts;
  const dayWord = daysLeft === 1 ? "день" : daysLeft < 5 ? "дня" : "дней";
  const subject = `Напоминание: документ «${documentTitle}» ожидает вашей подписи (осталось ${daysLeft} ${dayWord})`;
  const html = `
<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:24px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.05);">
    <div style="padding:24px 32px;border-bottom:1px solid #eee;">
      <h1 style="margin:0;font-size:18px;color:#111;">⏰ Напоминание о подписании документа</h1>
    </div>
    <div style="padding:24px 32px;color:#333;font-size:14px;line-height:1.6;">
      <p>Здравствуйте, ${recipientName}!</p>
      <p>Документ <strong>«${documentTitle}»</strong>${senderName ? ` от <strong>${senderName}</strong>` : ""} ожидает вашей подписи.</p>
      <p style="background:#fff7ed;border-left:3px solid #f97316;padding:12px 16px;border-radius:6px;color:#9a3412;">
        <strong>До истечения срока осталось ${daysLeft} ${dayWord}.</strong><br>
        После этого ссылка станет недействительной и потребуется отправка нового запроса.
      </p>
      <div style="text-align:center;margin:28px 0;">
        <a href="${signUrl}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:14px;">
          Открыть и подписать
        </a>
      </div>
      <p style="font-size:12px;color:#888;">Если кнопка не работает, скопируйте ссылку:<br>
      <a href="${signUrl}" style="color:#666;word-break:break-all;">${signUrl}</a></p>
    </div>
    <div style="padding:16px 32px;background:#fafafa;border-top:1px solid #eee;font-size:11px;color:#888;text-align:center;">
      Это автоматическое напоминание. Если документ уже подписан, проигнорируйте письмо.
    </div>
  </div>
</body></html>`.trim();
  return { subject, html };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const now = new Date();
    const today = new Date(now);
    today.setUTCHours(0, 0, 0, 0);

    // 1) Помечаем просроченные подписания как expired
    const { data: expiredSigs } = await supabase
      .from("document_signatures")
      .select("id")
      .lt("expires_at", now.toISOString())
      .in("status", ["sent", "viewed"]);

    if (expiredSigs && expiredSigs.length > 0) {
      await supabase
        .from("document_signatures")
        .update({ status: "expired" })
        .in("id", expiredSigs.map((s) => s.id));
    }

    let totalSent = 0;
    let totalSkipped = 0;
    const errors: string[] = [];

    // Базовый URL для ссылок на подпись
    const PUBLIC_BASE = Deno.env.get("PUBLIC_APP_URL") || "https://синтагма.рф";

    for (const days of REMINDER_DAYS) {
      // Окно: подписания, у которых expires_at попадает в [today + days, today + days + 1)
      const winStart = new Date(today);
      winStart.setUTCDate(winStart.getUTCDate() + days);
      const winEnd = new Date(winStart);
      winEnd.setUTCDate(winEnd.getUTCDate() + 1);

      const { data: sigs, error } = await supabase
        .from("document_signatures")
        .select("id, document_title, recipient_email, recipient_name, signature_token, sender_name, expires_at, organization_id")
        .gte("expires_at", winStart.toISOString())
        .lt("expires_at", winEnd.toISOString())
        .in("status", ["sent", "viewed"]);

      if (error) {
        console.error("query error:", error);
        errors.push(error.message);
        continue;
      }
      if (!sigs || sigs.length === 0) continue;

      for (const sig of sigs) {
        try {
          // Дедупликация: проверяем, не отправляли ли уже на этот этап
          const { data: existing } = await supabase
            .from("admin_notifications")
            .select("id")
            .eq("type", "signature_reminder")
            .eq("related_entity_id", sig.id)
            .contains("metadata", { reminder_days: days })
            .limit(1)
            .maybeSingle();

          if (existing) {
            totalSkipped++;
            continue;
          }

          if (!sig.recipient_email) {
            totalSkipped++;
            continue;
          }

          const signUrl = `${PUBLIC_BASE}/sign/${sig.signature_token}`;
          const { subject, html } = buildEmail({
            recipientName: sig.recipient_name || "коллега",
            documentTitle: sig.document_title,
            daysLeft: days,
            signUrl,
            senderName: sig.sender_name || undefined,
          });

          const ok = await sendSmtp(sig.recipient_email, subject, html);
          if (ok) {
            totalSent++;
            // Логируем факт напоминания
            await supabase.from("admin_notifications").insert({
              type: "signature_reminder",
              title: `Напоминание отправлено: ${sig.document_title}`,
              message: `${sig.recipient_email} — за ${days} дн. до истечения`,
              related_entity_id: sig.id,
              metadata: { reminder_days: days, expires_at: sig.expires_at, organization_id: sig.organization_id },
            });
          } else {
            errors.push(`Не удалось отправить ${sig.recipient_email}`);
          }
        } catch (sigErr: any) {
          console.error("sig processing error:", sigErr);
          errors.push(`${sig.id}: ${sigErr?.message || "unknown"}`);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        expired_marked: expiredSigs?.length || 0,
        reminders_sent: totalSent,
        reminders_skipped: totalSkipped,
        errors: errors.slice(0, 10),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error(e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
