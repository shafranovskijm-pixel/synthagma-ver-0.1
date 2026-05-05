import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const {
      email, password, full_name,
      org_name, phone, inn, kpp, ogrn, legal_address, director_name,
      subscription_plan, promo_code,
    } = body;

    if (!email || !password || !org_name || !full_name) {
      return new Response(JSON.stringify({ error: 'Не заполнены обязательные поля' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Check if user exists already
    const { data: existing } = await supabase.auth.admin.listUsers();
    if (existing?.users?.some(u => u.email?.toLowerCase() === email.toLowerCase())) {
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

    // Create org
    const { data: orgId, error: orgErr } = await supabase.rpc('create_organization', {
      p_name: org_name, p_email: email, p_phone: phone || null, p_inn: inn || null,
      p_contact_name: full_name, p_kpp: kpp || null, p_ogrn: ogrn || null,
      p_legal_address: legal_address || null, p_director_name: director_name || null,
    });
    if (orgErr) throw orgErr;

    await supabase.from('organizations').update({
      subscription_plan: subscription_plan || 'free',
      promo_code: promo_code || null,
    } as any).eq('id', orgId);

    // Link profile
    const { data: prof } = await supabase.from('profiles').select('id').eq('user_id', userId).maybeSingle();
    if (prof) {
      await supabase.from('profiles').update({ organization_id: orgId }).eq('user_id', userId);
    } else {
      await supabase.from('profiles').insert({ user_id: userId, organization_id: orgId, full_name, email });
    }

    // Set role
    const { error: roleErr } = await supabase.rpc('upgrade_to_organization_role', {
      p_user_id: userId, p_organization_id: orgId,
    });
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
