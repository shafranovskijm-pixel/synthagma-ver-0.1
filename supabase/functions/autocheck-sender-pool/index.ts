import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendSmtpEmail } from "../_shared/smtp-sender.ts";
import { createSenderPoolCheckHandler } from "./handler.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const checkRecipient = Deno.env.get("SMTP_CHECK_RECIPIENT") ?? "info@sintagma.com.ru";

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const handler = createSenderPoolCheckHandler({
  authorize: async (req) => {
    const authorization = req.headers.get("Authorization") ?? "";
    const accessToken = authorization.replace(/^Bearer\s+/i, "").trim();
    if (!accessToken || !supabaseUrl || !anonKey || !serviceRoleKey) {
      return { ok: false, status: 401 } as const;
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser(accessToken);
    if (userError || !userData.user) return { ok: false, status: 401 } as const;

    const { data: role, error: roleError } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .limit(1)
      .maybeSingle();
    if (roleError || role?.role !== "admin") return { ok: false, status: 403 } as const;
    return { ok: true } as const;
  },
  listActiveSenders: async () => {
    const { data, error } = await admin
      .from("email_sender_pool")
      .select("id,email,app_password,host,port,encryption,from_name")
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(100);
    if (error) throw new Error("sender_pool_unavailable");
    return data ?? [];
  },
  sendCheck: (sender) => sendSmtpEmail({
    host: sender.host,
    port: sender.port,
    username: sender.email,
    password: sender.app_password!,
    encryption: sender.encryption,
    from_email: sender.email,
    from_name: sender.from_name || "Синтагма",
  }, {
    to: checkRecipient,
    subject: `SMTP check ${sender.email}`,
    html: `<p>SMTP check from ${sender.email}</p>`,
  }),
  updateSender: async (id, update) => {
    const { error } = await admin.from("email_sender_pool").update(update).eq("id", id);
    if (error) throw new Error("sender_status_update_failed");
  },
  reportError: (error) => console.error(
    "autocheck-sender-pool failed:",
    error instanceof Error ? error.name : "unknown_error",
  ),
});

serve(handler);
