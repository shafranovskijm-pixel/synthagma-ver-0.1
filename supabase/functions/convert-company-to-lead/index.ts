import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { AccessError, accessErrorResponse, checked, readObject, requireActiveUser, requirePlatformSales, requireUuid } from "../_shared/privileged-access.ts";

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

    const actor = await requireActiveUser(req, supabase);
    await requirePlatformSales(supabase, actor);
    const body = await readObject(req);
    const companyDbId = requireUuid(body.companyDbId, "companyDbId");

    const { data: company, error: cErr } = await supabase
      .from('sales_companies_db')
      .select('*')
      .eq('id', companyDbId)
      .maybeSingle();

    checked({ data: company, error: cErr });
    if (!company) {
      return new Response(JSON.stringify({ error: 'Company not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (company.organization_id != null) {
      throw new AccessError(403, "Компания относится к CRM организации");
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

    const linked = await supabase
      .from('sales_companies_db')
      .update({ converted_to_lead_id: lead.id })
      .eq('id', companyDbId);
    if (linked.error) throw new Error("Failed to link converted lead");

    return new Response(JSON.stringify({ success: true, leadId: lead.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    return accessErrorResponse(error, corsHeaders);
  }
});
