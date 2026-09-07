import { withAuth, corsHeaders } from "../_shared/handler.ts";
import { callTestRpc } from "../_shared/test-rpc.ts";

Deno.serve(withAuth(async ({ req, body }) => {
  const payload = (body ?? {}) as { ping?: boolean; attempt_id?: string; answers?: unknown };
  if (payload.ping) return { ok: true };
  if (typeof payload.attempt_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.attempt_id)
    || !payload.answers || typeof payload.answers !== "object" || Array.isArray(payload.answers)) {
    return new Response(JSON.stringify({ error: "Начните тест перед отправкой ответов.", code: "attempt_required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  // Never accept client-provided question IDs or scores. Retrying this ID is idempotent.
  return callTestRpc(req, "submit_test_attempt", { p_attempt_id: payload.attempt_id, p_answers: payload.answers });
}));