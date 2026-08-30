import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendPlatformEmail } from "../_shared/smtp-sender.ts";
import { createSendEmailHandler } from "./handler.ts";
import {
  authorizeSendEmail,
  isAllowedConfiguredSender,
} from "./policy.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const handler = createSendEmailHandler({
  authorize: (req) => authorizeSendEmail(req, {
    serviceRoleKey,
    getVerifiedUser: async (accessToken) => {
      if (!supabaseUrl || !anonKey) return null;
      const userClient = createClient(supabaseUrl, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
      });
      const { data, error } = await userClient.auth.getUser(accessToken);
      if (error || !data.user) return null;
      return { id: data.user.id };
    },
    hasAdminRole: async (userId) => {
      if (!supabaseUrl || !serviceRoleKey) return false;
      // This service-role lookup is intentionally reached only after
      // auth.getUser has verified the browser caller.
      const admin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data, error } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "admin")
        .limit(1)
        .maybeSingle();
      return !error && data?.role === "admin";
    },
  }),
  isAdminSenderAllowed: async (mailbox) => {
    if (!supabaseUrl || !serviceRoleKey) return false;
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await admin
      .from("email_sender_pool")
      .select("email")
      .eq("is_active", true)
      .not("app_password", "is", null)
      .neq("app_password", "")
      .limit(1000);
    if (error) throw new Error("sender_configuration_unavailable");
    return isAllowedConfiguredSender(
      mailbox,
      Deno.env.get("SMTP_FROM") ?? null,
      (data ?? []).map((row) => String(row.email ?? "")),
    );
  },
  send: (payload) => sendPlatformEmail({
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
    fromOverride: payload.from,
  }),
  reportError: (error) => console.error(
    "send-email failed:",
    error instanceof Error ? error.name : "unknown_error",
  ),
});

serve(handler);
