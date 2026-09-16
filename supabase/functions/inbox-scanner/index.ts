// Read-only inbox scan. Durable ingestion precedes every cursor checkpoint.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { connectImap, closeImap, examineInbox, searchUidsSince, fetchRfc822, parseRfc822 } from "../_shared/imap-mini.ts";
import { inboxMessagePayload } from "./message-payload.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

class ScanFailure extends Error {
  constructor(readonly category: string, readonly uncertain = false) { super(category); }
}

function uid(value: unknown, zeroAllowed = false): number {
  const number = typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
  if (!Number.isSafeInteger(number) || number < (zeroAllowed ? 0 : 1) || number > 4294967295) throw new ScanFailure("invalid_cursor");
  return number;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const cronSecret = Deno.env.get("MAILING_CAMPAIGN_CRON_SECRET") || "";
  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  let authorized = (!!serviceKey && bearer === serviceKey)
    || (cronSecret.length >= 24 && req.headers.get("x-cron-secret") === cronSecret);
  // Preserve the admin Unibox "check inbox" action, without admitting any
  // ordinary authenticated user or exposing pool credentials before role check.
  if (!authorized && bearer && Deno.env.get("SUPABASE_ANON_KEY")) {
    try {
      const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: req.headers.get("Authorization")! } },
      });
      const identity = await userClient.auth.getUser();
      if (!identity.error && identity.data?.user?.id) {
        const role = await userClient.from("user_roles").select("role")
          .eq("user_id", identity.data.user.id).eq("role", "admin").maybeSingle();
        authorized = !role.error && role.data?.role === "admin";
      }
    } catch { /* Fail closed on auth/role lookup error. */ }
  }
  if (!authorized) return json({ error: "Forbidden" }, 403);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!serviceKey) return json({ error: "Service configuration missing" }, 503);
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
  const summary = { scanned: 0, new_messages: 0, attributed: 0, skipped: 0, errors: [] as string[], report_flush: "pending" };
  const { data: senders, error } = await supabase.from("email_sender_pool")
    .select("id,email,app_password,imap_host,imap_port,imap_encryption")
    .eq("is_active", true).not("imap_host", "is", null);
  if (error) return json({ error: "sender_lookup_failed" }, 500);

  for (const sender of senders || []) {
    const token = crypto.randomUUID();
    let owned = false;
    let outcome: "completed" | "failed" | "uncertain" = "completed";
    let connection: Awaited<ReturnType<typeof connectImap>> | null = null;
    try {
      const { data: claim, error: claimError } = await supabase.rpc("claim_ordinary_inbox_scan", {
        p_sender_pool_id: sender.id, p_token: token,
      });
      if (claimError || !claim) throw new ScanFailure("scan_claim_unconfirmed", true);
      if (claim.claimed !== true) { summary.skipped++; continue; }
      owned = true;
      let lastUid = uid(claim.last_uid, true);
      const savedValidity = claim.uid_validity == null ? null : uid(claim.uid_validity);
      // imap-mini supports implicit TLS only; never downgrade to plaintext.
      if (sender.imap_encryption !== "ssl" || !sender.app_password || !sender.imap_host) throw new ScanFailure("imap_configuration_invalid");
      connection = await connectImap({ host: sender.imap_host, port: sender.imap_port || 993, user: sender.email, password: sender.app_password });
      const { uidValidity } = await examineInbox(connection);
      const validity = uid(uidValidity);
      const checkpoint = async (next: number) => {
        let result;
        try {
          result = await supabase.rpc("checkpoint_ordinary_inbox_scan", {
            p_sender_pool_id: sender.id, p_token: token, p_uid_validity: validity, p_last_uid: next,
          });
        } catch { throw new ScanFailure("checkpoint_unconfirmed", true); }
        if (result.error) throw new ScanFailure("checkpoint_unconfirmed", true);
        if (result.data?.updated !== true) throw new ScanFailure("checkpoint_rejected");
        lastUid = next;
      };
      if (savedValidity !== validity) {
        // First use/rollover scans from zero, never UIDNEXT or legacy cursor.
        await checkpoint(0);
      }
      const uids = (await searchUidsSince(connection, lastUid)).slice(0, 40);
      summary.scanned++;
      const scanDeadline = Date.now() + 45000;
      for (const nextUid of uids) {
        if (Date.now() >= scanDeadline) break;
        const next = uid(nextUid);
        if (next <= lastUid) throw new ScanFailure("non_monotonic_search");
        const raw = await fetchRfc822(connection, next, 262144);
        if (!raw) throw new ScanFailure("fetch_message_missing");
        const message = inboxMessagePayload(raw, sender.email, parseRfc822, new TextEncoder().encode(raw).length >= 262144);
        let stored;
        try {
          stored = await supabase.rpc("store_ordinary_inbox_message", {
            p_sender_kind: "pool", p_sender_id: sender.id, p_scan_token: token,
            p_uid_validity: validity, p_uid: next, p_message: message,
          });
        } catch { throw new ScanFailure("inbox_store_unconfirmed", true); }
        if (stored.error) throw new ScanFailure("inbox_store_unconfirmed", true);
        if (stored.data?.stored !== true) throw new ScanFailure("inbox_store_rejected");
        if (!stored.data.duplicate && !message.ignored_reason) summary.new_messages++;
        if (!stored.data.duplicate && stored.data.attributed === true) summary.attributed++;
        await checkpoint(next);
      }
    } catch (error) {
      const failure = error instanceof ScanFailure ? error : new ScanFailure("imap_scan_failed");
      outcome = failure.uncertain ? "uncertain" : "failed";
      summary.errors.push(`${sender.id}:${failure.category}`);
    } finally {
      if (connection) await closeImap(connection).catch(() => undefined);
      if (owned) {
        try {
          const released = await supabase.rpc("release_ordinary_inbox_scan", {
            p_sender_pool_id: sender.id, p_token: token, p_outcome: outcome,
          });
          if (released.error || released.data?.released !== true) summary.errors.push(`${sender.id}:scan_release_unconfirmed`);
        } catch { summary.errors.push(`${sender.id}:scan_release_unconfirmed`); }
      }
    }
  }

  // Notification failure never rewinds saved inbox results; outbox stays durable.
  try {
    const flush = await supabase.functions.invoke("notify-mailing-campaign-report", { body: {} });
    summary.report_flush = flush.error ? "failed" : "requested";
  } catch { summary.report_flush = "failed"; }
  return json(summary);
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
