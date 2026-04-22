import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendSmtpEmail, type SmtpConfig } from "../_shared/smtp-sender.ts";
import { processCampaignHtml } from "../_shared/email-html-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    // Get platform SMTP
    const host = Deno.env.get("SMTP_HOST");
    const port = Deno.env.get("SMTP_PORT");
    const user = Deno.env.get("SMTP_USER");
    const pass = Deno.env.get("SMTP_PASS");
    const fromEnv = Deno.env.get("SMTP_FROM") || "noreply@sintagma.com.ru";
    if (!host || !port || !user || !pass) {
      throw new Error("Платформенный SMTP не настроен");
    }
    const m = fromEnv.match(/^(.+?)\s*<(.+)>$/);
    const smtp: SmtpConfig = {
      host,
      port: parseInt(port, 10),
      username: user,
      password: pass,
      encryption: parseInt(port, 10) === 465 ? "ssl" : "starttls",
      from_email: m ? m[2].trim() : fromEnv,
      from_name: m ? m[1].trim() : "Sintagma",
    };

    // Find subscribers due to receive next step
    const nowIso = new Date().toISOString();
    const { data: subs, error: subsErr } = await admin
      .from("email_drip_subscribers")
      .select("*, sequence:email_drip_sequences(id, name, is_active)")
      .eq("status", "active")
      .lte("next_send_at", nowIso)
      .limit(50);

    if (subsErr) throw subsErr;
    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ ok: true, processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let sent = 0;
    let failed = 0;
    let completed = 0;

    for (const sub of subs) {
      const seq = (sub as any).sequence;
      if (!seq?.is_active) {
        await admin.from("email_drip_subscribers")
          .update({ status: "paused" })
          .eq("id", sub.id);
        continue;
      }

      // Suppression check
      const { data: isSupp } = await admin.rpc("is_email_suppressed", {
        p_email: sub.email,
        p_scope: "platform",
      });
      if (isSupp === true) {
        await admin.from("email_drip_subscribers")
          .update({ status: "unsubscribed", unsubscribed_at: new Date().toISOString() })
          .eq("id", sub.id);
        continue;
      }

      // Get next step
      const nextStepOrder = (sub.current_step || 0) + 1;
      const { data: step } = await admin
        .from("email_drip_steps")
        .select("*")
        .eq("sequence_id", sub.sequence_id)
        .eq("step_order", nextStepOrder)
        .maybeSingle();

      if (!step) {
        // Sequence completed
        await admin.from("email_drip_subscribers")
          .update({ status: "completed", completed_at: new Date().toISOString() })
          .eq("id", sub.id);
        completed++;
        continue;
      }

      // Variables
      const vars: Record<string, string> = {
        name: sub.recipient_name || sub.email.split("@")[0],
        email: sub.email,
        date: new Date().toLocaleDateString("ru-RU"),
      };
      let subject = step.subject;
      let html = step.html;
      Object.entries(vars).forEach(([k, v]) => {
        const re = new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, "gi");
        subject = subject.replace(re, v);
        html = html.replace(re, v);
      });

      // Process click tracking + UTM + footer
      const processed = await processCampaignHtml(admin, {
        html,
        recipientEmail: sub.email,
        campaignId: `drip:${sub.sequence_id}`,
        utmEnabled: true,
        utmCampaign: `drip-${seq.name}`,
      });

      try {
        await sendSmtpEmail({
          smtp,
          to: sub.email,
          subject,
          html: processed.html,
          extraHeaders: processed.headers,
        });

        await admin.from("email_drip_sends").insert({
          subscriber_id: sub.id,
          step_id: step.id,
          status: "sent",
        });

        // Schedule next step
        const { data: nextStep } = await admin
          .from("email_drip_steps")
          .select("delay_days, delay_hours")
          .eq("sequence_id", sub.sequence_id)
          .eq("step_order", nextStepOrder + 1)
          .maybeSingle();

        let nextSendAt: string;
        let newStatus = "active";
        if (nextStep) {
          const delayMs = (nextStep.delay_days || 0) * 86400000 + (nextStep.delay_hours || 0) * 3600000;
          nextSendAt = new Date(Date.now() + delayMs).toISOString();
        } else {
          // Mark completed after this last step
          nextSendAt = new Date().toISOString();
          newStatus = "completed";
          completed++;
        }

        await admin.from("email_drip_subscribers")
          .update({
            current_step: nextStepOrder,
            next_send_at: nextSendAt,
            status: newStatus,
            ...(newStatus === "completed" ? { completed_at: new Date().toISOString() } : {}),
          })
          .eq("id", sub.id);

        sent++;
      } catch (err: any) {
        failed++;
        await admin.from("email_drip_sends").insert({
          subscriber_id: sub.id,
          step_id: step.id,
          status: "failed",
          error: err?.message || String(err),
        });
        // Retry in 1 hour
        await admin.from("email_drip_subscribers")
          .update({ next_send_at: new Date(Date.now() + 3600000).toISOString() })
          .eq("id", sub.id);
      }
    }

    return new Response(JSON.stringify({ ok: true, processed: subs.length, sent, failed, completed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("process-drip-campaigns error:", err);
    return new Response(JSON.stringify({ error: err?.message || String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
