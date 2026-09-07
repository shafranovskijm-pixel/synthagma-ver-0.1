import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { corsHeaders } from "./handler.ts";

/** Run under the caller JWT. The database owns authorization, quotas and grading. */
export async function callTestRpc(req: Request, name: string, args: Record<string, unknown>) {
  const client = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: req.headers.get("authorization") ?? "" } } },
  );
  const { data, error } = await client.rpc(name, args);
  if (!error) return data;
  const status = error.code === "42501" ? 403 : error.code === "P0001" ? 409 : (error.code === "22023" || error.code === "22P02") ? 400 : 500;
  const message = status === 500 ? "Не удалось обработать тест. Повторите отправку этой попытки." : error.message;
  return new Response(JSON.stringify({ error: message, code: error.code, details: error.details }), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}