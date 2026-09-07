import { withAuth, corsHeaders } from "../_shared/handler.ts";
import { callTestRpc } from "../_shared/test-rpc.ts";

Deno.serve(withAuth(async ({ req, body }) => {
  const payload = (body ?? {}) as { ping?: boolean; lesson_id?: string };
  if (payload.ping) return { ok: true };
  if (!payload.lesson_id) {
    return new Response(JSON.stringify({ error: "lesson_id is required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  // Includes limits before the first attempt, active sessions and immutable results.
  return callTestRpc(req, "get_student_test_state", { p_lesson_id: payload.lesson_id });
}));