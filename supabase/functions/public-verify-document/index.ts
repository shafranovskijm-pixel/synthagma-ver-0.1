import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const regNumber = url.searchParams.get('reg_number')?.trim();

    if (!regNumber || regNumber.length < 2 || regNumber.length > 100) {
      return new Response(JSON.stringify({ valid: false, error: 'Некорректный регистрационный номер' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: doc, error } = await supabase
      .from('education_document_records')
      .select('id, reg_number, full_name, document_type, document_number, document_series, issue_date, specialty_name, qualification_name, document_status, organization_id, protocol_number, protocol_date')
      .ilike('reg_number', regNumber)
      .maybeSingle();

    if (error || !doc) {
      return new Response(JSON.stringify({ valid: false, error: 'Документ не найден в реестре' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let orgName: string | null = null;
    if (doc.organization_id) {
      const { data: org } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', doc.organization_id)
        .maybeSingle();
      orgName = org?.name ?? null;
    }

    // Mask full name partially: "Иванов И. И."
    const maskName = (name: string) => {
      const parts = name.trim().split(/\s+/);
      if (parts.length === 0) return name;
      const last = parts[0];
      const initials = parts.slice(1).map((p) => `${p[0]}.`).join(' ');
      return `${last} ${initials}`.trim();
    };

    return new Response(
      JSON.stringify({
        valid: doc.document_status !== 'cancelled' && doc.document_status !== 'invalidated',
        document: {
          reg_number: doc.reg_number,
          full_name_masked: maskName(doc.full_name),
          document_type: doc.document_type,
          document_number: doc.document_number,
          document_series: doc.document_series,
          issue_date: doc.issue_date,
          specialty_name: doc.specialty_name,
          qualification_name: doc.qualification_name,
          status: doc.document_status,
          organization_name: orgName,
          protocol_number: doc.protocol_number,
          protocol_date: doc.protocol_date,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    console.error('public-verify-document error', e);
    return new Response(JSON.stringify({ valid: false, error: 'Внутренняя ошибка' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
