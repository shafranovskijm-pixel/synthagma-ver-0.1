 import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
 import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
 
 const corsHeaders = {
   "Access-Control-Allow-Origin": "*",
   "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
 };
 
 serve(async (req) => {
   if (req.method === "OPTIONS") {
     return new Response(null, { headers: corsHeaders });
   }
 
   try {
     // Verify authentication
     const authHeader = req.headers.get('authorization');
     if (!authHeader) {
       return new Response(
         JSON.stringify({ error: "Authentication required" }),
         { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
       );
     }
 
     const supabaseAuth = createClient(
       Deno.env.get("SUPABASE_URL") ?? "",
       Deno.env.get("SUPABASE_ANON_KEY") ?? "",
       { global: { headers: { Authorization: authHeader } } }
     );
 
     const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
     if (authError || !user) {
       return new Response(
         JSON.stringify({ error: "Invalid authentication" }),
         { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
       );
     }
 
      const body = await req.json();

      // Health check ping
      if (body.ping) {
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { lesson_id, answers, shown_question_ids } = body;

      if (!lesson_id || !answers || !shown_question_ids || !Array.isArray(shown_question_ids)) {
       return new Response(
         JSON.stringify({ error: "Missing required fields: lesson_id, answers, shown_question_ids" }),
         { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
       );
     }
 
     // Use service role to access correct answers (bypasses RLS)
     const supabaseAdmin = createClient(
       Deno.env.get("SUPABASE_URL") ?? "",
       Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
       { auth: { autoRefreshToken: false, persistSession: false } }
     );
 
     // Verify the lesson exists and user has enrollment
     const { data: enrollment, error: enrollmentError } = await supabaseAuth
       .from('enrollments')
       .select('id, course_id')
       .eq('user_id', user.id)
       .eq('course_id', (await supabaseAdmin.from('lessons').select('course_id').eq('id', lesson_id).single()).data?.course_id)
       .maybeSingle();
 
     if (enrollmentError || !enrollment) {
       return new Response(
         JSON.stringify({ error: "You are not enrolled in this course" }),
         { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
       );
     }
 
     // Fetch correct answers server-side (RLS bypassed with service role)
      const { data: questionsWithAnswers, error: fetchError } = await supabaseAdmin
        .from('test_questions')
        .select('id, correct_answer, explanation')
        .in('id', shown_question_ids);
 
     if (fetchError || !questionsWithAnswers) {
       console.error('Error fetching correct answers:', fetchError);
       return new Response(
         JSON.stringify({ error: "Failed to fetch test questions" }),
         { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
       );
     }
 
     // Calculate score
      const correctAnswersMap = new Map<string, number>();
      const explanationsMap = new Map<string, string | null>();
      questionsWithAnswers.forEach(q => {
        correctAnswersMap.set(q.id, q.correct_answer);
        explanationsMap.set(q.id, q.explanation ?? null);
      });
 
     let score = 0;
     shown_question_ids.forEach((qId: string) => {
       const correctAnswer = correctAnswersMap.get(qId);
       if (correctAnswer !== undefined && answers[qId] === correctAnswer) {
         score++;
       }
     });
 
     const maxScore = shown_question_ids.length;
 
     // Get lesson passing score
     const { data: lesson } = await supabaseAdmin
       .from('lessons')
       .select('test_passing_score')
       .eq('id', lesson_id)
       .single();
 
     const passingScore = lesson?.test_passing_score ?? 80;
     const scorePercent = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
     const passed = scorePercent >= passingScore;
 
     // Save test attempt
     const { error: insertError } = await supabaseAdmin
       .from('test_attempts')
       .insert({
         lesson_id,
         user_id: user.id,
         score,
         max_score: maxScore,
         answers,
         shown_question_ids
       });
 
     if (insertError) {
       console.error('Error saving test attempt:', insertError);
       return new Response(
         JSON.stringify({ error: "Failed to save test result" }),
         { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
       );
     }
 
     // If passed, update lesson progress
     if (passed) {
       await supabaseAdmin
         .from('lesson_progress')
         .upsert({
           lesson_id,
           user_id: user.id,
           completed: true,
           completed_at: new Date().toISOString()
         }, { onConflict: 'lesson_id,user_id' });
     }
 
     console.log(`Test graded for user ${user.id}: ${score}/${maxScore} (${scorePercent}%), passed: ${passed}`);
 
     return new Response(
       JSON.stringify({
         score,
         maxScore,
         scorePercent,
         passed,
         passingScore,
          correctAnswers: Object.fromEntries(correctAnswersMap),
          explanations: Object.fromEntries(explanationsMap)
       }),
       { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
     );
   } catch (error: unknown) {
     const errorMessage = error instanceof Error ? error.message : "Unknown error";
     console.error("Error:", errorMessage);
     return new Response(
       JSON.stringify({ error: errorMessage }),
       { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
     );
   }
 });