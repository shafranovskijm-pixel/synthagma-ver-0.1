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
 
     const { lesson_id } = await req.json();
 
     if (!lesson_id) {
       return new Response(
         JSON.stringify({ error: "Missing required field: lesson_id" }),
         { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
       );
     }
 
     const supabaseAdmin = createClient(
       Deno.env.get("SUPABASE_URL") ?? "",
       Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
       { auth: { autoRefreshToken: false, persistSession: false } }
     );
 
     // Get user's last attempt for this lesson
     const { data: lastAttempt, error: attemptError } = await supabaseAuth
       .from('test_attempts')
       .select('*')
       .eq('lesson_id', lesson_id)
       .eq('user_id', user.id)
       .order('completed_at', { ascending: false })
       .limit(1)
       .maybeSingle();
 
     if (attemptError) {
       console.error('Error fetching attempt:', attemptError);
       return new Response(
         JSON.stringify({ error: "Failed to fetch test attempt" }),
         { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
       );
     }
 
     if (!lastAttempt) {
       return new Response(
         JSON.stringify({ hasAttempt: false }),
         { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
       );
     }
 
     // Get all attempts to track used question IDs
     const { data: allAttempts } = await supabaseAuth
       .from('test_attempts')
       .select('shown_question_ids')
       .eq('lesson_id', lesson_id)
       .eq('user_id', user.id);
 
     const allUsedIds = new Set<string>();
     allAttempts?.forEach(attempt => {
       const ids = attempt.shown_question_ids as string[] || [];
       ids.forEach(id => allUsedIds.add(id));
     });
 
     const shownIds = lastAttempt.shown_question_ids as string[] || [];
 
     // Fetch correct answers server-side (bypasses RLS)
     const { data: questionsWithAnswers } = await supabaseAdmin
       .from('test_questions')
       .select('id, correct_answer, explanation')
       .in('id', shownIds);
 
     const correctAnswersMap: Record<string, number> = {};
     const explanationsMap: Record<string, string | null> = {};
     questionsWithAnswers?.forEach(q => {
       correctAnswersMap[q.id] = q.correct_answer;
       explanationsMap[q.id] = q.explanation;
     });
 
     // Get lesson passing score
     const { data: lesson } = await supabaseAdmin
       .from('lessons')
       .select('test_passing_score')
       .eq('id', lesson_id)
       .single();
 
     const passingScore = lesson?.test_passing_score ?? 80;
     const scorePercent = lastAttempt.max_score > 0 
       ? Math.round((lastAttempt.score / lastAttempt.max_score) * 100) 
       : 0;
     const passed = scorePercent >= passingScore;
 
     console.log(`Test results fetched for user ${user.id}, lesson ${lesson_id}`);
 
     return new Response(
       JSON.stringify({
         hasAttempt: true,
         attempt: lastAttempt,
         correctAnswers: correctAnswersMap,
         explanations: explanationsMap,
         usedQuestionIds: Array.from(allUsedIds),
         passed,
         passingScore,
         scorePercent
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