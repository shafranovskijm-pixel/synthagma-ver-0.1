import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendSmtpEmail } from "../_shared/smtp-sender.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: rows } = await admin.from("email_sender_pool").select("*").like("email", "%@yi.mannni.com");
  const results: any[] = [];
  for (const r of rows || []) {
    if (!r.app_password) { results.push({ email: r.email, ok: false, error: "no password" }); continue; }
    let err: string | null = null;
    try {
      await sendSmtpEmail({
        host: r.host, port: r.port, username: r.email, password: r.app_password,
        encryption: r.encryption, from_email: r.email, from_name: r.from_name || "Синтагма",
      }, {
        to: "info@sintagma.com.ru",
        subject: `SMTP check ${r.email}`,
        html: `<p>Test from ${r.email}</p>`,
      });
    } catch (e) { err = (e as Error).message; }
    await admin.from("email_sender_pool").update({
      is_active: !err,
      last_error: err,
      last_error_at: err ? new Date().toISOString() : null,
    }).eq("id", r.id);
    results.push({ email: r.email, ok: !err, error: err });
  }
  return new Response(JSON.stringify({ results, ok_count: results.filter(x => x.ok).length }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
