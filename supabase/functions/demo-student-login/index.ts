// Idempotent demo student login.
// First call: creates a permanent demo student account, enrolls into 4 courses
// from the platform marketplace organization, generates lesson_progress for
// realistic progress (65% / 100% / 30% / 0%), creates 2 of 3 identity
// documents. Subsequent calls just return the same email+password.
//
// The frontend page /demo-student-login invokes this and then runs
// supabase.auth.signInWithPassword + navigates to /student.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEMO_EMAIL = 'demo-student@sintagma.demo';
const DEMO_FULL_NAME = 'Иванов Иван Иванович';
// Platform marketplace organization (has many published courses).
const DEMO_ORG_ID = '4ac2c05a-d8b5-4e72-ba31-f2c743091d95';
// Curated 4 courses to assign with progress (verified to have 7-8 lessons each).
const ASSIGNED_COURSE_IDS = [
  '1cda82e0-b9e5-4d79-8229-b05a81e0c25a', // Охрана труда — Группа II → 65%
  'e273cffa-1eb1-47af-b807-c70bda13492d', // Первая помощь — Группа III → 100%
  'c45e9f4b-6658-47a5-bb8f-b788b7c8cbdf', // Охрана труда — Группа III → 30%
  'd5eced04-1c7f-4e45-9654-881cb0b9dd48', // Группа V → 0%
];
const PROGRESS_PERCENTS = [65, 100, 30, 0];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const password = Deno.env.get('DEMO_STUDENT_PASSWORD') || 'DemoStudent2026!';
    const sb = createClient(url, key);

    // 1. Ensure auth user exists.
    const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
    let user = list?.users?.find(u => u.email === DEMO_EMAIL);

    if (!user) {
      const { data: created, error: createErr } = await sb.auth.admin.createUser({
        email: DEMO_EMAIL,
        password,
        email_confirm: true,
        user_metadata: { full_name: DEMO_FULL_NAME, is_demo_student: true },
      });
      if (createErr) throw createErr;
      user = created.user;
    } else {
      // Ensure password matches the secret (in case it was rotated).
      await sb.auth.admin.updateUserById(user.id, { password });
    }

    const userId = user!.id;

    // 2. Profile: attach to demo org, mark onboarding done.
    await sb.from('profiles').upsert({
      user_id: userId,
      full_name: DEMO_FULL_NAME,
      email: DEMO_EMAIL,
      organization_id: DEMO_ORG_ID,
      onboarding_completed: true,
    }, { onConflict: 'user_id' });

    // 3. Role = student.
    await sb.from('user_roles').upsert(
      { user_id: userId, role: 'student' },
      { onConflict: 'user_id' },
    );

    // 4. Enrollments + lesson_progress (only seed if not already present).
    const { data: existingEnrollments } = await sb
      .from('enrollments')
      .select('course_id')
      .eq('user_id', userId);

    const existingSet = new Set((existingEnrollments || []).map(e => e.course_id));

    for (let i = 0; i < ASSIGNED_COURSE_IDS.length; i++) {
      const courseId = ASSIGNED_COURSE_IDS[i];
      const targetPct = PROGRESS_PERCENTS[i];

      if (existingSet.has(courseId)) continue;

      // Fetch lessons for this course.
      const { data: lessons } = await sb
        .from('lessons')
        .select('id')
        .eq('course_id', courseId)
        .order('order_index', { ascending: true });

      const totalLessons = lessons?.length || 0;
      const completedCount = Math.round((targetPct / 100) * totalLessons);
      const status = targetPct === 100 ? 'completed' : 'active';

      const { data: enrollment } = await sb.from('enrollments').insert({
        user_id: userId,
        course_id: courseId,
        progress: targetPct,
        time_spent: completedCount * 600,
        status,
        started_at: new Date(Date.now() - (i + 1) * 86400000 * 3).toISOString(),
        completed_at: targetPct === 100 ? new Date().toISOString() : null,
      }).select('id').single();

      if (lessons && completedCount > 0) {
        const rows = lessons.slice(0, completedCount).map(l => ({
          user_id: userId,
          lesson_id: l.id,
          completed: true,
          completed_at: new Date().toISOString(),
          time_spent: 600,
        }));
        if (rows.length > 0) {
          await sb.from('lesson_progress').upsert(rows, { onConflict: 'user_id,lesson_id' });
        }
      }
    }

    // 5. Identity documents (passport + SNILS — placeholder).
    const { data: existingDocs } = await sb
      .from('student_identity_documents')
      .select('type')
      .eq('user_id', userId);
    const haveTypes = new Set((existingDocs || []).map(d => d.type));

    const docsToCreate = [
      { type: 'passport', name: 'Паспорт.pdf' },
      { type: 'snils', name: 'СНИЛС.pdf' },
    ].filter(d => !haveTypes.has(d.type));

    if (docsToCreate.length > 0) {
      await sb.from('student_identity_documents').insert(
        docsToCreate.map(d => ({
          user_id: userId,
          organization_id: DEMO_ORG_ID,
          type: d.type,
          name: d.name,
          file_url: '/placeholder.svg',
        })),
      );
    }

    return new Response(JSON.stringify({ email: DEMO_EMAIL, password }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('demo-student-login error:', err);
    return new Response(JSON.stringify({ error: String((err as Error).message || err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
