import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://esm.sh/zod@3.24.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RegisterOrganizationSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  full_name: z.string().min(1),
  org_name: z.string().min(1),
  phone: z.string().optional().nullable(),
  inn: z.string().optional().nullable(),
  kpp: z.string().optional().nullable(),
  ogrn: z.string().optional().nullable(),
  legal_address: z.string().optional().nullable(),
  director_name: z.string().optional().nullable(),
  subscription_plan: z.string().optional().nullable(),
  promo_code: z.string().optional().nullable(),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const parsed = RegisterOrganizationSchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: 'Не заполнены обязательные поля' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const {
      email, password, full_name,
      org_name, phone, inn, kpp, ogrn, legal_address, director_name,
      subscription_plan, promo_code,
    } = parsed.data;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const normalizedPlan = subscription_plan && subscription_plan !== 'free' ? subscription_plan : 'free';

    const { data: existing } = await supabase.from('profiles').select('user_id').ilike('email', email).maybeSingle();
    if (existing?.user_id) {
      return new Response(JSON.stringify({ error: 'Пользователь с таким email уже зарегистрирован' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Create confirmed user
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { full_name },
    });
    if (createErr || !created.user) throw createErr ?? new Error('Не удалось создать пользователя');
    const userId = created.user.id;

    const { data: createdOrg, error: orgErr } = await supabase
      .from('organizations')
      .insert({
        name: org_name,
        email,
        phone: phone || null,
        inn: inn || null,
        contact_name: full_name,
        kpp: kpp || null,
        ogrn: ogrn || null,
        legal_address: legal_address || null,
        director_name: director_name || null,
        subscription_plan: 'free',
        tariff_type: 'free',
        is_paid: false,
        ai_enabled: false,
        promo_code: promo_code || null,
      } as any)
      .select('id')
      .single();
    if (orgErr || !createdOrg) throw orgErr ?? new Error('Не удалось создать организацию');

    const orgId = createdOrg.id;

    const { error: freePlanErr } = await supabase.rpc('apply_free_plan_features', { org_id: orgId });
    if (freePlanErr) throw freePlanErr;

    if (normalizedPlan !== 'free') {
      const { error: planErr } = await supabase
        .from('organizations')
        .update({ subscription_plan: normalizedPlan } as any)
        .eq('id', orgId);
      if (planErr) throw planErr;
    }

    const { error: profileErr } = await supabase.from('profiles').upsert({
      user_id: userId,
      organization_id: orgId,
      full_name,
      email,
    }, { onConflict: 'user_id' });
    if (profileErr) throw profileErr;

    const { error: roleErr } = await supabase.from('user_roles').upsert({
      user_id: userId,
      role: 'organization',
    }, { onConflict: 'user_id' });
    if (roleErr) throw roleErr;

    return new Response(JSON.stringify({ success: true, user_id: userId, organization_id: orgId }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('register-organization error:', e);
    const msg = e?.message || 'Ошибка регистрации';
    return new Response(JSON.stringify({ error: msg }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
