import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  closeImap,
  connectImap,
  highestInboxUid,
  parseRfc822,
  scanInbox,
} from "../_shared/imap-mini.ts";
import { classifyMailingReply } from "../_shared/mailing-reply-classifier.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-cron-secret",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

type ScanState = {
  sender_id: string;
  last_uid: number;
  baseline_completed: boolean;
  claim_token: string;
};

type CampaignMatch = {
  campaign_id: string;
  job_id: string;
  recipient_id: string;
  organization_id: string;
};

function imapErrorCategory(value: unknown): "auth" | "timeout" | "tls" | "connection" {
  const message = value instanceof Error ? value.message.toLowerCase() : "";
  if (/login|auth|credentials|password/.test(message)) return "auth";
  if (/timeout/.test(message)) return "timeout";
  if (/tls|certificate|handshake/.test(message)) return "tls";
  return "connection";
}

function imapErrorLabel(category: ReturnType<typeof imapErrorCategory>) {
  if (category === "auth") return "IMAP: ошибка авторизации";
  if (category === "timeout") return "IMAP: превышено время ожидания";
  if (category === "tls") return "IMAP: ошибка защищённого соединения";
  return "IMAP: нет соединения";
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const expected = Deno.env.get("MAILING_CAMPAIGN_CRON_SECRET") || "";
  const supplied = req.headers.get("X-Cron-Secret") || "";
  if (expected.length < 24 || supplied !== expected) return json({ error: "Unauthorized" }, 401);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey);
  const now = Date.now();

  const { data: campaigns, error: campaignError } = await admin
    .from("email_campaigns")
    .select("id")
    .eq("campaign_mode", "cold_outreach")
    .in("status", ["scheduled", "sending", "paused", "completed"])
    .gte("scheduled_at", new Date(now - 30 * 86_400_000).toISOString())
    .lte("scheduled_at", new Date(now + 7 * 86_400_000).toISOString());
  if (campaignError) return json({ error: "campaign_lookup_failed" }, 503);

  const campaignIds = (campaigns || []).map((campaign) => campaign.id);
  if (!campaignIds.length) {
    return json({ success: true, claimed: 0, baselined: 0, scanned: 0, replies: 0, errors: 0 });
  }

  const { data: claimed, error: claimError } = await admin.rpc("claim_mailing_reply_scan_senders", {
    p_campaign_ids: campaignIds,
    p_batch_size: 5,
    p_stale_after: "3 minutes",
  });
  if (claimError) return json({ error: "reply_scan_claim_failed" }, 503);

  const states = (Array.isArray(claimed) ? claimed : []) as ScanState[];
  const outcomes = await Promise.all(states.map((state) => scanSender(admin, state, campaignIds)));
  const summary = outcomes.reduce(
    (acc, item) => ({
      baselined: acc.baselined + item.baselined,
      scanned: acc.scanned + item.scanned,
      replies: acc.replies + item.replies,
      errors: acc.errors + item.errors,
    }),
    { baselined: 0, scanned: 0, replies: 0, errors: 0 },
  );

  return json({ success: true, claimed: states.length, ...summary });
});

async function scanSender(admin: any, state: ScanState, campaignIds: string[]) {
  const result = { baselined: 0, scanned: 0, replies: 0, errors: 0 };
  let conn: Awaited<ReturnType<typeof connectImap>> | null = null;
  try {
    const { data: secretRows, error: secretError } = await admin.rpc("get_mailing_sender_secret", {
      p_sender_id: state.sender_id,
    });
    const config = Array.isArray(secretRows) ? secretRows[0] : secretRows;
    if (secretError || !config?.secret || !config?.imap_host || !config?.imap_username) {
      throw new Error("IMAP configuration unavailable");
    }

    conn = await connectImap({
      host: config.imap_host,
      port: config.imap_port || 993,
      user: config.imap_username,
      password: config.secret,
    });

    if (!state.baseline_completed) {
      const lastUid = await highestInboxUid(conn);
      await admin.from("mailing_reply_scan_state").update({
        last_uid: lastUid,
        baseline_completed: true,
        last_scanned_at: new Date().toISOString(),
        claimed_at: null,
        claim_token: null,
        last_error_category: null,
        last_error: null,
      }).eq("sender_id", state.sender_id).eq("claim_token", state.claim_token);
      result.baselined = 1;
      return result;
    }

    const messages = await scanInbox(conn, Number(state.last_uid || 0), 20);
    let lastUid = Number(state.last_uid || 0);
    result.scanned = 1;
    for (const message of messages) {
      try {
        const stored = await processIncoming(admin, {
          senderId: state.sender_id,
          senderEmail: config.from_email,
          campaignIds,
          uid: message.uid,
          raw: message.raw,
        });
        if (stored) result.replies += 1;
        lastUid = message.uid;
      } catch {
        // Do not move the cursor past a transient persistence failure.
        result.errors += 1;
        break;
      }
    }

    await admin.from("mailing_reply_scan_state").update({
      last_uid: lastUid,
      last_scanned_at: new Date().toISOString(),
      claimed_at: null,
      claim_token: null,
      last_error_category: null,
      last_error: null,
    }).eq("sender_id", state.sender_id).eq("claim_token", state.claim_token);
  } catch (error) {
    result.errors += 1;
    const category = imapErrorCategory(error);
    await admin.from("mailing_reply_scan_state").update({
      last_scanned_at: new Date().toISOString(),
      claimed_at: null,
      claim_token: null,
      last_error_category: category,
      last_error: imapErrorLabel(category),
    }).eq("sender_id", state.sender_id).eq("claim_token", state.claim_token);
  } finally {
    if (conn) await closeImap(conn);
  }
  return result;
}

async function processIncoming(admin: any, input: {
  senderId: string;
  senderEmail: string;
  campaignIds: string[];
  uid: number;
  raw: string;
}) {
  if (/^X-Warmup-Id\s*:/imu.test(input.raw)) return false;

  const parsed = parseRfc822(input.raw);
  const remoteEmail = String(parsed.from_email || "").trim().toLowerCase();
  if (!remoteEmail || remoteEmail === String(input.senderEmail).toLowerCase()) return false;
  if (remoteEmail.includes("mailer-daemon") || remoteEmail.startsWith("postmaster@")) return false;

  const { data: matchRows, error: matchError } = await admin.rpc("match_mailing_campaign_reply", {
    p_sender_id: input.senderId,
    p_campaign_ids: input.campaignIds,
    p_remote_email: remoteEmail,
    p_in_reply_to: parsed.in_reply_to,
    p_received_at: parsed.received_at.toISOString(),
  });
  if (matchError) throw new Error("reply_match_failed");
  const match = (Array.isArray(matchRows) ? matchRows[0] : matchRows) as CampaignMatch | undefined;
  if (!match?.job_id) return false;

  const rawHeaders = input.raw.split(/\r?\n\r?\n/, 1)[0] || "";
  const classified = classifyMailingReply({
    subject: parsed.subject,
    bodyText: parsed.body_text,
    rawHeaders,
  });

  const { error: insertError } = await admin.from("mailing_campaign_replies").insert({
    organization_id: match.organization_id,
    campaign_id: match.campaign_id,
    job_id: match.job_id,
    recipient_id: match.recipient_id,
    sender_id: input.senderId,
    imap_uid: input.uid,
    message_id: parsed.message_id,
    in_reply_to: parsed.in_reply_to,
    remote_email: remoteEmail,
    remote_name: parsed.from_name,
    subject: String(parsed.subject || "").slice(0, 500),
    body_text: classified.directText,
    received_at: parsed.received_at.toISOString(),
    classification: classified.classification,
    interest_hours: classified.interestHours,
  });
  if (insertError?.code === "23505") return false;
  if (insertError) throw new Error("reply_store_failed");

  if (classified.classification !== "auto_reply") {
    await admin.from("mailing_send_jobs").update({
      status: "cancelled",
      last_error_category: "recipient_replied",
      last_error: null,
    }).eq("recipient_id", match.recipient_id).eq("status", "pending");
  }

  if (classified.classification === "unsubscribe" || classified.classification === "not_interested") {
    const { error: suppressionError } = await admin.from("email_suppressions").upsert({
      email: remoteEmail,
      scope: match.organization_id,
      reason: classified.classification === "unsubscribe" ? "unsubscribe" : "manual",
      source_campaign_id: match.campaign_id,
    }, { onConflict: "email,scope" });
    if (suppressionError) throw new Error("reply_suppression_failed");
  }

  return true;
}
