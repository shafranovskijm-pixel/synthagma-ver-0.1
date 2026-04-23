import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { withAuth } from "../_shared/handler.ts";

interface GradeBody {
  ping?: boolean;
  lesson_id?: string;
  answers?: Record<string, number>;
  shown_question_ids?: string[];
}

Deno.serve(withAuth(async ({ req, body, user }) => {
  const payload = (body ?? {}) as GradeBody;

  if (payload.ping) {
    return { ok: true };
  }

  const { lesson_id, answers, shown_question_ids } = payload;
  if (!lesson_id || !answers || !shown_question_ids || !Array.isArray(shown_question_ids)) {
    return new Response(
      JSON.stringify({ error: "Missing required fields: lesson_id, answers, shown_question_ids" }),
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

  // Verify enrollment
  const lessonRow = await supabaseAdmin
    .from("lessons")
    .select("course_id")
    .eq("id", lesson_id)
    .single();

  const { data: enrollment, error: enrollmentError } = await supabaseAuth
    .from("enrollments")
    .select("id, course_id")
    .eq("user_id", user.sub)
    .eq("course_id", lessonRow.data?.course_id)
    .maybeSingle();

  if (enrollmentError || !enrollment) {
    return new Response(
      JSON.stringify({ error: "You are not enrolled in this course" }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  const { data: questionsWithAnswers, error: fetchError } = await supabaseAdmin
    .from("test_questions")
    .select("id, correct_answer, explanation")
    .in("id", shown_question_ids);

  if (fetchError || !questionsWithAnswers) {
    console.error("Error fetching correct answers:", fetchError);
    return new Response(
      JSON.stringify({ error: "Failed to fetch test questions" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const correctAnswersMap = new Map<string, number>();
  const explanationsMap = new Map<string, string | null>();
  questionsWithAnswers.forEach((q) => {
    correctAnswersMap.set(q.id, q.correct_answer);
    explanationsMap.set(q.id, q.explanation ?? null);
  });

  let score = 0;
  shown_question_ids.forEach((qId) => {
    const correctAnswer = correctAnswersMap.get(qId);
    if (correctAnswer !== undefined && answers[qId] === correctAnswer) {
      score++;
    }
  });

  const maxScore = shown_question_ids.length;

  const { data: lesson } = await supabaseAdmin
    .from("lessons")
    .select("test_passing_score")
    .eq("id", lesson_id)
    .single();

  const passingScore = lesson?.test_passing_score ?? 80;
  const scorePercent = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
  const passed = scorePercent >= passingScore;

  const { error: insertError } = await supabaseAdmin
    .from("test_attempts")
    .insert({
      lesson_id,
      user_id: user.sub,
      score,
      max_score: maxScore,
      answers,
      shown_question_ids,
    });

  if (insertError) {
    console.error("Error saving test attempt:", insertError);
    return new Response(
      JSON.stringify({ error: "Failed to save test result" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  if (passed) {
    await supabaseAdmin
      .from("lesson_progress")
      .upsert(
        {
          lesson_id,
          user_id: user.sub,
          completed: true,
          completed_at: new Date().toISOString(),
        },
        { onConflict: "lesson_id,user_id" }
      );
  }

  console.log(`Test graded for user ${user.sub}: ${score}/${maxScore} (${scorePercent}%), passed: ${passed}`);

  return {
    score,
    maxScore,
    scorePercent,
    passed,
    passingScore,
    correctAnswers: Object.fromEntries(correctAnswersMap),
    explanations: Object.fromEntries(explanationsMap),
  };
}));
