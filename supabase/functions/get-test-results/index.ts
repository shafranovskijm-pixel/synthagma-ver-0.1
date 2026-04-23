import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { withAuth } from "../_shared/handler.ts";

interface GetResultsBody {
  ping?: boolean;
  lesson_id?: string;
}

Deno.serve(withAuth(async ({ req, body, user }) => {
  const payload = (body ?? {}) as GetResultsBody;

  if (payload.ping) {
    return { ok: true };
  }

  const lesson_id = payload.lesson_id;
  if (!lesson_id) {
    return new Response(
      JSON.stringify({ error: "Missing required field: lesson_id" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  const authHeader = req.headers.get("authorization") ?? "";
  const supabaseAuth = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: lastAttempt, error: attemptError } = await supabaseAuth
    .from("test_attempts")
    .select("*")
    .eq("lesson_id", lesson_id)
    .eq("user_id", user.sub)
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (attemptError) {
    console.error("Error fetching attempt:", attemptError);
    return new Response(
      JSON.stringify({ error: "Failed to fetch test attempt" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!lastAttempt) {
    return { hasAttempt: false };
  }

  const { data: allAttempts } = await supabaseAuth
    .from("test_attempts")
    .select("shown_question_ids")
    .eq("lesson_id", lesson_id)
    .eq("user_id", user.sub);

  const allUsedIds = new Set<string>();
  allAttempts?.forEach((attempt) => {
    const ids = (attempt.shown_question_ids as string[]) || [];
    ids.forEach((id) => allUsedIds.add(id));
  });

  const shownIds = (lastAttempt.shown_question_ids as string[]) || [];

  const { data: questionsWithAnswers } = await supabaseAdmin
    .from("test_questions")
    .select("id, correct_answer, explanation")
    .in("id", shownIds);

  const correctAnswersMap: Record<string, number> = {};
  const explanationsMap: Record<string, string | null> = {};
  questionsWithAnswers?.forEach((q) => {
    correctAnswersMap[q.id] = q.correct_answer;
    explanationsMap[q.id] = q.explanation;
  });

  const { data: lesson } = await supabaseAdmin
    .from("lessons")
    .select("test_passing_score")
    .eq("id", lesson_id)
    .single();

  const passingScore = lesson?.test_passing_score ?? 80;
  const scorePercent = lastAttempt.max_score > 0
    ? Math.round((lastAttempt.score / lastAttempt.max_score) * 100)
    : 0;
  const passed = scorePercent >= passingScore;

  console.log(`Test results fetched for user ${user.sub}, lesson ${lesson_id}`);

  return {
    hasAttempt: true,
    attempt: lastAttempt,
    correctAnswers: correctAnswersMap,
    explanations: explanationsMap,
    usedQuestionIds: Array.from(allUsedIds),
    passed,
    passingScore,
    scorePercent,
  };
}));
