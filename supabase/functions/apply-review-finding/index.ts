import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ApplyBody {
  courseId: string;
  target_kind: "test_question" | "lesson_title";
  target_id: string;
  patch: Record<string, unknown>;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const body = (await req.json()) as ApplyBody;
    const { courseId, target_kind, target_id, patch } = body || ({} as ApplyBody);
    if (!courseId || !target_kind || !target_id || !patch || typeof patch !== "object") {
      return json({ error: "Invalid payload" }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Permission check: user must be in organization that owns the course with edit rights
    const { data: course, error: courseErr } = await admin
      .from("courses")
      .select("id, organization_id")
      .eq("id", courseId)
      .single();
    if (courseErr || !course) return json({ error: "Course not found" }, 404);

    const { data: hasPerm } = await admin.rpc("has_org_staff_permission", {
      _user_id: userId,
      _org_id: course.organization_id,
      _permission: "courses.manage",
    });
    // Allow global admins as fallback
    let allowed = !!hasPerm;
    if (!allowed) {
      const { data: isAdmin } = await admin.rpc("has_admin_staff_role", { _user_id: userId });
      allowed = !!isAdmin;
    }
    if (!allowed) return json({ error: "Forbidden" }, 403);

    if (target_kind === "test_question") {
      // Verify question belongs to a lesson of this course
      const { data: q, error: qErr } = await admin
        .from("test_questions")
        .select("id, lesson_id, options")
        .eq("id", target_id)
        .single();
      if (qErr || !q) return json({ error: "Question not found" }, 404);
      const { data: lesson } = await admin
        .from("lessons")
        .select("course_id")
        .eq("id", q.lesson_id)
        .single();
      if (!lesson || lesson.course_id !== courseId) return json({ error: "Question not in course" }, 403);

      const update: Record<string, unknown> = {};
      if (typeof patch.question === "string") update.question = patch.question;
      if (typeof patch.explanation === "string") update.explanation = patch.explanation;
      if (typeof patch.correct_answer === "number" && patch.correct_answer >= 0) {
        update.correct_answer = Math.floor(patch.correct_answer);
      }
      if (Array.isArray(patch.options)) {
        // Normalize: keep object-shape if existing was objects
        const existingIsObjects = Array.isArray(q.options) && q.options.length > 0 && typeof (q.options as any)[0] === "object";
        update.options = existingIsObjects
          ? (patch.options as unknown[]).map((t, i) => ({ text: String(t), id: i }))
          : (patch.options as unknown[]).map((t) => String(t));
      }
      if (Object.keys(update).length === 0) return json({ error: "Empty patch" }, 400);

      const { error: updErr } = await admin.from("test_questions").update(update).eq("id", target_id);
      if (updErr) return json({ error: updErr.message }, 500);
      return json({ ok: true });
    }

    if (target_kind === "lesson_title") {
      if (typeof patch.title !== "string" || !patch.title.trim()) {
        return json({ error: "Empty title" }, 400);
      }
      const { data: lesson, error: lErr } = await admin
        .from("lessons")
        .select("id, course_id")
        .eq("id", target_id)
        .single();
      if (lErr || !lesson || lesson.course_id !== courseId) {
        return json({ error: "Lesson not in course" }, 403);
      }
      const { error: updErr } = await admin
        .from("lessons")
        .update({ title: patch.title.trim() })
        .eq("id", target_id);
      if (updErr) return json({ error: updErr.message }, 500);
      return json({ ok: true });
    }

    return json({ error: "Unsupported target_kind" }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[apply-review-finding] Error:", message);
    return json({ error: message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
