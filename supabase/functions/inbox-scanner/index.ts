// IMAP-сканер входящих для «Переписок» (Unibox).
// Обходит все активные ящики email_sender_pool с заполненным imap_host,
// вычитывает новые письма (UID > imap_last_uid) и сохраняет в
// email_conversations/email_messages. Игнорирует автопрогрев (X-Warmup-Id) и bounce (MAILER-DAEMON).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { connectImap, closeImap, scanInbox, parseRfc822 } from "../_shared/imap-mini.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: senders, error } = await supabase
    .from("email_sender_pool")
    .select("id,email,app_password,imap_host,imap_port,imap_encryption,imap_last_uid")
    .eq("is_active", true)
    .not("imap_host", "is", null);

  if (error) return json({ error: error.message }, 500);

  const summary = { scanned: 0, new_messages: 0, errors: [] as string[] };

  for (const s of senders || []) {
    try {
      const conn = await connectImap({
        host: s.imap_host!,
        port: s.imap_port || 993,
        user: s.email,
        password: s.app_password,
      });
      let maxUid = s.imap_last_uid || 0;
      try {
        const msgs = await scanInbox(conn, maxUid, 40);
        summary.scanned++;
        for (const m of msgs) {
          try {
            await processMessage(supabase, s.id, s.email, m.raw);
            summary.new_messages++;
          } catch (e) {
            summary.errors.push(`msg uid=${m.uid} ${s.email}: ${(e as Error).message}`);
          }
          if (m.uid > maxUid) maxUid = m.uid;
        }
      } finally {
        await closeImap(conn);
      }
      await supabase.from("email_sender_pool")
        .update({ imap_last_uid: maxUid, imap_last_scan_at: new Date().toISOString() })
        .eq("id", s.id);
    } catch (e) {
      summary.errors.push(`${s.email}: ${(e as Error).message}`);
    }
  }

  return json(summary, 200);
});

async function processMessage(supabase: any, senderId: string, senderEmail: string, raw: string) {
  const parsed = parseRfc822(raw);

  // Игнорируем автопрогрев
  if (/X-Warmup-Id\s*:/i.test(raw)) return;
  // Игнорируем очевидные bounce/автоответы
  const fromLower = parsed.from_email.toLowerCase();
  if (fromLower.includes("mailer-daemon") || fromLower.includes("postmaster@")) return;

  const remote = parsed.from_email;
  if (!remote || remote === senderEmail.toLowerCase()) return;

  // Найти / создать conversation
  let convId: string | null = null;
  {
    const { data: existing } = await supabase
      .from("email_conversations")
      .select("id")
      .eq("sender_id", senderId)
      .eq("remote_email", remote)
      .maybeSingle();
    if (existing?.id) convId = existing.id;
    else {
      const { data: created, error: ce } = await supabase
        .from("email_conversations")
        .insert({
          sender_id: senderId,
          remote_email: remote,
          remote_name: parsed.from_name,
          subject: parsed.subject || "(без темы)",
        })
        .select("id")
        .single();
      if (ce) throw new Error("conv insert: " + ce.message);
      convId = created!.id;
    }
  }

  // Дедуп по message_id
  if (parsed.message_id) {
    const { data: dup } = await supabase
      .from("email_messages")
      .select("id")
      .eq("conversation_id", convId!)
      .eq("message_id", parsed.message_id)
      .maybeSingle();
    if (dup?.id) return;
  }

  const { error: ie } = await supabase.from("email_messages").insert({
    conversation_id: convId,
    direction: "incoming",
    from_email: remote,
    from_name: parsed.from_name,
    to_email: senderEmail,
    subject: parsed.subject,
    body_text: parsed.body_text?.slice(0, 60000),
    body_html: parsed.body_html?.slice(0, 200000),
    message_id: parsed.message_id,
    in_reply_to: parsed.in_reply_to,
    references_ids: parsed.references_ids,
    received_at: parsed.received_at.toISOString(),
    is_read: false,
  });
  if (ie) throw new Error("msg insert: " + ie.message);
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
