import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Транслит для генерации логина из ФИО
const TRANSLIT: Record<string, string> = {
  а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'i',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'c',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya',
};
function translit(s: string): string {
  return s.toLowerCase().split('').map(c => TRANSLIT[c] ?? c).join('').replace(/[^a-z0-9.]/g, '');
}
function makeLoginFromName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean).map(translit).filter(Boolean);
  const base = (parts.slice(0, 2).join('.') || `sales${Date.now().toString(36)}`).slice(0, 40);
  return `${base}@sales.sintagma.local`;
}
function makePassword(len = 12): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => chars[b % chars.length]).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: claims, error: claimsErr } = await callerClient.auth.getClaims(authHeader.replace('Bearer ', ''));
    if (claimsErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: roleData } = await adminClient.from('user_roles').select('role').eq('user_id', claims.claims.sub).single();
    if (roleData?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Admin access required' }), { status: 403, headers: corsHeaders });
    }

    const body = await req.json();
    const full_name: string = (body.full_name || '').trim();
    const phone: string | null = body.phone || null;
    if (!full_name) {
      return new Response(JSON.stringify({ error: 'full_name required' }), { status: 400, headers: corsHeaders });
    }

    // Авто-генерация email/пароля, если не заданы
    let email: string = (body.email || '').trim().toLowerCase();
    let password: string = body.password || '';
    const auto = !email || !password;
    if (!email) email = makeLoginFromName(full_name);
    if (!password) password = makePassword(12);

    // Проверяем коллизию email — при необходимости добавляем суффикс
    let attempt = 0;
    let created: any = null;
    let createErr: any = null;
    while (attempt < 5) {
      const tryEmail = attempt === 0 ? email : email.replace('@', `-${attempt + 1}@`);
      const res = await adminClient.auth.admin.createUser({
        email: tryEmail,
        password,
        email_confirm: true,
        user_metadata: { full_name },
      });
      if (!res.error && res.data?.user) {
        created = res.data.user;
        email = tryEmail;
        break;
      }
      createErr = res.error;
      // если это не коллизия email — прекращаем
      if (!/already|registered|exists/i.test(res.error?.message || '')) break;
      attempt++;
    }

    if (!created) {
      return new Response(JSON.stringify({ error: createErr?.message || 'Failed to create user' }), { status: 400, headers: corsHeaders });
    }

    const userId = created.id;

    await adminClient.from('user_roles').update({ role: 'sales_manager' }).eq('user_id', userId);
    await adminClient.from('sales_managers').insert({ user_id: userId, full_name, phone });
    await adminClient.from('profiles').update({ full_name }).eq('user_id', userId);

    return new Response(
      JSON.stringify({ success: true, user_id: userId, email, password, generated: auto }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: corsHeaders });
  }
});
