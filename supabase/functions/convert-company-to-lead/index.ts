import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { companyDbId } = await req.json();
    if (!companyDbId) {
      return new Response(JSON.stringify({ error: 'companyDbId is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: company, error: cErr } = await supabase
      .from('sales_companies_db')
      .select('*')
      .eq('id', companyDbId)
      .maybeSingle();

    if (cErr || !company) {
      return new Response(JSON.stringify({ error: 'Company not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (company.converted_to_lead_id) {
      return new Response(JSON.stringify({
        success: true,
        leadId: company.converted_to_lead_id,
        alreadyExists: true,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const noteParts: string[] = [];
    if (company.director) noteParts.push(`Директор: ${company.director}`);
    if (company.license_number) {
      noteParts.push(`Лицензия: ${company.license_number}${company.license_issue_date ? ` (от ${company.license_issue_date})` : ''}`);
    }
    if (company.source_url) noteParts.push(`Источник: ${company.source_url}`);

    const leadRow = {
      org_name: company.name,
      inn: company.inn,
      ogrn: company.ogrn,
      license_number: company.license_number,
      license_date: company.license_issue_date,
      region: company.region,
      city: company.city,
      address: company.address,
      phone: company.phone,
      email: company.email,
      website: company.website,
      status: 'new',
      source: 'sales_companies_db',
      notes: noteParts.join('\n') || null,
    };

    const { data: lead, error: lErr } = await supabase
      .from('sales_leads')
      .insert(leadRow)
      .select('id')
      .single();

    if (lErr) {
      return new Response(JSON.stringify({ error: lErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    await supabase
      .from('sales_companies_db')
      .update({ converted_to_lead_id: lead.id })
      .eq('id', companyDbId);

    return new Response(JSON.stringify({ success: true, leadId: lead.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
