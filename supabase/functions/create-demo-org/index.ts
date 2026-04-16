import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from 'https://esm.sh/@supabase/supabase-js@2/cors';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { demo_link_id, participant_name, org_name } = await req.json();

    if (!demo_link_id || !participant_name || !org_name) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Verify demo link exists and is active
    const { data: link, error: linkError } = await supabase
      .from('sales_demo_links')
      .select('id, is_active')
      .eq('id', demo_link_id)
      .single();

    if (linkError || !link?.is_active) {
      return new Response(JSON.stringify({ error: 'Invalid or inactive demo link' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Generate unique email and password for demo user
    const uniqueId = crypto.randomUUID().slice(0, 8);
    const email = `demo-${uniqueId}@demo.sigma`;
    const password = `Demo${crypto.randomUUID().slice(0, 12)}!`;

    // Create auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: participant_name, is_demo: true },
    });

    if (authError) {
      console.error('Auth create error:', authError);
      return new Response(JSON.stringify({ error: 'Failed to create user' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = authData.user.id;

    // Create demo organization
    const { data: orgData, error: orgError } = await supabase
      .from('organizations')
      .insert({
        name: org_name,
        email: email,
        contact_name: participant_name,
        subscription_plan: 'free',
        tariff_type: 'free',
        is_paid: false,
      })
      .select('id')
      .single();

    if (orgError) {
      console.error('Org create error:', orgError);
      return new Response(JSON.stringify({ error: 'Failed to create organization' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update profile with org
    await supabase
      .from('profiles')
      .update({ organization_id: orgData.id, full_name: participant_name })
      .eq('user_id', userId);

    // Set role to organization
    await supabase
      .from('user_roles')
      .update({ role: 'organization' })
      .eq('user_id', userId);

    // Record demo session
    await supabase.from('sales_demo_sessions').insert({
      demo_link_id,
      organization_id: orgData.id,
      user_id: userId,
      participant_name,
      org_name,
    });

    return new Response(JSON.stringify({
      success: true,
      email,
      password,
      organization_id: orgData.id,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Demo org error:', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
