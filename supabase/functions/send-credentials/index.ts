import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendPlatformEmail, sendSmtpEmail } from "../_shared/smtp-sender.ts";
import { createStudentCredentialsHandler } from "../_shared/student-credentials.ts";

const url = Deno.env.get("SUPABASE_URL") ?? "";
const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
  auth: { autoRefreshToken: false, persistSession: false },
});
serve(createStudentCredentialsHandler("send", {
  db: admin,
  authenticate: async authorization => {
    const client = createClient(url, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: authorization } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await client.auth.getUser();
    return { userId: data?.user?.id ?? null, error };
  },
  sendEmail: async message => {
    // Preserve the existing sender-pool -> platform SMTP fallback. Log no
    // recipient, password, bearer token or raw transport error.
    let sender = null;
    try {
      const { data, error } = await admin.rpc("pick_next_email_sender");
      sender = !error && Array.isArray(data) ? data[0] : null;
    } catch { /* The platform sender remains available if the pool is down. */ }
    if (sender) {
      let sent = false;
      try {
        await sendSmtpEmail({ host: sender.host, port: sender.port, username: sender.email,
          password: sender.app_password, encryption: sender.encryption,
          from_email: sender.email, from_name: sender.from_name || "СИНТАГМА" }, message);
        sent = true;
      } catch { /* Fall back only if the actual send failed. */ }
      try {
        await admin.rpc("mark_email_sender_result", { _sender_id: sender.id,
          _error: sent ? null : "Не удалось отправить письмо с данными входа" });
      } catch { /* Sender accounting must not trigger a duplicate delivery. */ }
      if (sent) return;
    }
    const result = await sendPlatformEmail(message);
    if (!result.ok) throw new Error("Credentials email delivery failed");
  },
}));
