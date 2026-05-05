import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface AttemptPayload {
  attempt_id?: string;
  step: "submitted" | "success" | "failed";
  email?: string;
  phone?: string;
  org_name?: string;
  contact_name?: string;
  inn?: string;
  selected_plan?: string;
  promo_code?: string;
  ref_code?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  page_url?: string;
  referrer?: string;
  error_message?: string;
  user_id?: string;
  organization_id?: string;
}

// In-memory dedupe for Telegram failed alerts (per email, 1 hour)
const tgDedupe = new Map<string, number>();
const TG_DEDUPE_MS = 60 * 60 * 1000;

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

function clean(v: unknown, max = 500): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.slice(0, max);
}

async function notifyTelegramOnFailure(p: AttemptPayload, ip: string | null) {
  const email = p.email || "";
  if (email) {
    const last = tgDedupe.get(email);
    if (last && Date.now() - last < TG_DEDUPE_MS) return;
    tgDedupe.set(email, Date.now());
  }
  const utm = [p.utm_source, p.utm_medium, p.utm_campaign].filter(Boolean).join(" / ");
  const message =
    `⚠️ <b>ОШИБКА регистрации организации</b>\n\n` +
    `<b>Организация:</b> ${p.org_name || "—"}\n` +
    `<b>Контакт:</b> ${p.contact_name || "—"}\n` +
    `<b>Email:</b> ${p.email || "—"}\n` +
    `<b>Телефон:</b> ${p.phone || "—"}\n` +
    `<b>ИНН:</b> ${p.inn || "—"}\n` +
    `<b>Тариф:</b> ${p.selected_plan || "—"}\n` +
    (utm ? `<b>Источник:</b> ${utm}\n` : "") +
    (ip ? `<b>IP:</b> ${ip}\n` : "") +
    `\n<b>Ошибка:</b> ${p.error_message || "—"}\n\n` +
    `📞 Перезвоните клиенту — он не смог зарегистрироваться сам!`;
  try {
    await supabase.functions.invoke("send-telegram-notification", { body: { message } });
  } catch (e) {
    console.error("Telegram notify failed:", e);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ct = req.headers.get("content-type") || "";
    let raw: any;
    if (ct.includes("application/json")) {
      raw = await req.json();
    } else {
      // sendBeacon may send text/plain
      const text = await req.text();
      try { raw = JSON.parse(text); } catch { raw = {}; }
    }

    const step = clean(raw.step, 16);
    if (!step || !["submitted", "success", "failed"].includes(step)) {
      return new Response(JSON.stringify({ error: "invalid step" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ip =
      req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      req.headers.get("x-real-ip") ||
      null;

    const payload: AttemptPayload = {
      step: step as any,
      email: clean(raw.email, 255) || undefined,
      phone: clean(raw.phone, 64) || undefined,
      org_name: clean(raw.org_name, 255) || undefined,
      contact_name: clean(raw.contact_name, 255) || undefined,
      inn: clean(raw.inn, 32) || undefined,
      selected_plan: clean(raw.selected_plan, 64) || undefined,
      promo_code: clean(raw.promo_code, 64) || undefined,
      ref_code: clean(raw.ref_code, 64) || undefined,
      utm_source: clean(raw.utm_source, 128) || undefined,
      utm_medium: clean(raw.utm_medium, 128) || undefined,
      utm_campaign: clean(raw.utm_campaign, 128) || undefined,
      utm_term: clean(raw.utm_term, 128) || undefined,
      utm_content: clean(raw.utm_content, 128) || undefined,
      page_url: clean(raw.page_url, 1024) || undefined,
      referrer: clean(raw.referrer, 1024) || undefined,
      error_message: clean(raw.error_message, 2000) || undefined,
      user_id: clean(raw.user_id, 64) || undefined,
      organization_id: clean(raw.organization_id, 64) || undefined,
    };

    const row: any = {
      ...payload,
      user_agent: clean(req.headers.get("user-agent"), 500) || undefined,
      ip,
    };

    let attemptId: string | null = clean(raw.attempt_id, 64);
    if (attemptId) {
      // Update existing record
      const updateRow = { ...row };
      delete updateRow.created_at;
      const { error } = await supabase
        .from("registration_attempts")
        .update(updateRow)
        .eq("id", attemptId);
      if (error) {
        // If not found, fall back to insert
        console.warn("Update failed, inserting:", error.message);
        const { data, error: insErr } = await supabase
          .from("registration_attempts").insert(row).select("id").maybeSingle();
        if (insErr) throw insErr;
        attemptId = data?.id || attemptId;
      }
    } else {
      const { data, error } = await supabase
        .from("registration_attempts").insert(row).select("id").maybeSingle();
      if (error) throw error;
      attemptId = data?.id || null;
    }

    if (step === "failed") {
      notifyTelegramOnFailure(payload, ip);
    }

    return new Response(JSON.stringify({ ok: true, attempt_id: attemptId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("log-registration-attempt error:", err);
    return new Response(JSON.stringify({ error: err.message || "internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
