// Demo helper edge function: updates lessons.content for the 3 demo courses only.
// Protected by a shared secret (DEMO_WRITE_TOKEN). Service-role client.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_COURSE_IDS = new Set([
  "32fb43d7-7dfa-44ef-bc92-97fd8938eec5",
  "3a6393da-113d-450d-b051-df5a8c6d7e81",
  "fff5db1c-b440-4cbf-b2dd-14f46dcacaac",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const token = req.headers.get("x-demo-token");
    const expected = Deno.env.get("DEMO_WRITE_TOKEN");
    if (!expected || token !== expected) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const body = await req.json();
    const { lesson_id, content, course_id } = body ?? {};
    if (!lesson_id || !content || !course_id) {
      return new Response(JSON.stringify({ error: "missing fields" }), { status: 400, headers: corsHeaders });
    }
    if (!ALLOWED_COURSE_IDS.has(course_id)) {
      return new Response(JSON.stringify({ error: "course not allowed" }), { status: 403, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Verify lesson belongs to allowed course
    const { data: lesson, error: lerr } = await supabase
      .from("lessons")
      .select("id, module:course_modules!inner(course_id)")
      .eq("id", lesson_id)
      .single();
    if (lerr || !lesson) {
      return new Response(JSON.stringify({ error: "lesson not found" }), { status: 404, headers: corsHeaders });
    }
    // @ts-ignore
    if (lesson.module?.course_id !== course_id) {
      return new Response(JSON.stringify({ error: "lesson/course mismatch" }), { status: 403, headers: corsHeaders });
    }

    const { error: uerr } = await supabase
      .from("lessons")
      .update({ content, updated_at: new Date().toISOString() })
      .eq("id", lesson_id);
    if (uerr) throw uerr;

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
