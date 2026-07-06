// Отправка ответа в переписке из CRM.
// Тело: { conversation_id, body_html, subject? }
// SMTP берётся из email_sender_pool, ставим In-Reply-To/References для правильной нитки.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { sendSmtpEmail } from "../_shared/smtp-sender.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  // Проверка авторизации + роли admin
  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "unauthorized" }, 401);
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: userData } = await userClient.auth.getUser();
  const uid = userData?.user?.id;
  if (!uid) return json({ error: "unauthorized" }, 401);
  const { data: isAdmin } = await userClient.rpc("has_role", { _user_id: uid, _role: "admin" });
  if (!isAdmin) return json({ error: "forbidden" }, 403);

  const body = await req.json().catch(() => ({}));
  const { conversation_id, body_html, subject: subjectOverride } = body || {};
  if (!conversation_id || !body_html) return json({ error: "conversation_id and body_html required" }, 400);

  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: conv, error: ce } = await supabase
    .from("email_conversations")
    .select("id, sender_id, remote_email, remote_name, subject")
    .eq("id", conversation_id)
    .single();
  if (ce || !conv) return json({ error: "conversation not found" }, 404);

  const { data: sender, error: se } = await supabase
    .from("email_sender_pool")
    .select("id,email,app_password,host,port,encryption,from_name")
    .eq("id", conv.sender_id)
    .single();
  if (se || !sender) return json({ error: "sender not found" }, 404);

  const { data: lastIncoming } = await supabase
    .from("email_messages")
    .select("message_id,references_ids")
    .eq("conversation_id", conv.id)
    .eq("direction", "incoming")
    .order("received_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const subject = subjectOverride || (conv.subject?.startsWith("Re:") ? conv.subject : `Re: ${conv.subject || ""}`.trim());

  const newMessageId = `<${crypto.randomUUID()}@${sender.email.split("@")[1] || "mail"}>`;
  const extraHeaders: Record<string, string> = { "Message-ID": newMessageId };
  if (lastIncoming?.message_id) {
    extraHeaders["In-Reply-To"] = lastIncoming.message_id;
    const refs = [lastIncoming.references_ids, lastIncoming.message_id].filter(Boolean).join(" ");
    extraHeaders["References"] = refs;
  }

  try {
    await sendSmtpEmail(
      {
        host: sender.host,
        port: sender.port,
        username: sender.email,
        password: sender.app_password,
        encryption: sender.encryption,
        from_email: sender.email,
        from_name: sender.from_name,
      },
      { to: conv.remote_email, subject, html: body_html, extraHeaders },
    );
  } catch (e) {
    const err = (e as Error).message;
    await supabase.from("email_messages").insert({
      conversation_id: conv.id,
      direction: "outgoing",
      from_email: sender.email,
      to_email: conv.remote_email,
      subject,
      body_html,
      message_id: newMessageId,
      in_reply_to: lastIncoming?.message_id || null,
      references_ids: extraHeaders["References"] || null,
      send_error: err,
    });
    return json({ error: err }, 502);
  }

  const { data: ins, error: ie } = await supabase.from("email_messages").insert({
    conversation_id: conv.id,
    direction: "outgoing",
    from_email: sender.email,
    from_name: sender.from_name,
    to_email: conv.remote_email,
    subject,
    body_html,
    body_text: body_html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
    message_id: newMessageId,
    in_reply_to: lastIncoming?.message_id || null,
    references_ids: extraHeaders["References"] || null,
    is_read: true,
  }).select("id").single();

  if (ie) return json({ error: ie.message }, 500);

  // Помечаем нить как прочитанную
  await supabase.from("email_conversations")
    .update({ unread_count: 0 })
    .eq("id", conv.id);

  return json({ ok: true, id: ins?.id }, 200);
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
