import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { inn } = await req.json();
    
    if (!inn) {
      return new Response(
        JSON.stringify({ error: 'INN is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('DADATA_API_KEY');
    if (!apiKey) {
      console.error('DADATA_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'DaData API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Searching company by INN: ${inn}`);

    const response = await fetch('https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById/party', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Token ${apiKey}`,
      },
      body: JSON.stringify({ 
        query: inn,
        branch_type: 'MAIN',
        count: 1 
      }),
    });

    if (!response.ok) {
      console.error(`DaData API error: ${response.status} ${response.statusText}`);
      return new Response(
        JSON.stringify({ error: 'DaData API error' }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    console.log(`Found ${data.suggestions?.length || 0} companies`);

    if (data.suggestions && data.suggestions.length > 0) {
      const company = data.suggestions[0];
      
      // Получаем учредителей
      const founders = company.data.founders?.map((f: any) => {
        if (f.type === 'LEGAL') {
          return f.name?.full || f.name?.short || 'Юридическое лицо';
        }
        return f.fio?.surname 
          ? `${f.fio.surname} ${f.fio.name || ''} ${f.fio.patronymic || ''}`.trim()
          : f.name || 'Физическое лицо';
      }) || [];
      
      // Получаем лицензии на образовательную деятельность
      const licenses = company.data.licenses?.filter((l: any) => 
        l.activities?.some((a: string) => 
          a.toLowerCase().includes('образовательн') || 
          a.toLowerCase().includes('обучени')
        ) || l.number?.includes('Л035')
      ) || [];
      
      // Берём первую образовательную лицензию или любую другую
      const educationLicense = licenses[0] || company.data.licenses?.[0];
      
      console.log('Founders found:', founders.length);
      console.log('Licenses found:', company.data.licenses?.length || 0);
      console.log('Education licenses found:', licenses.length);
      
      return new Response(
        JSON.stringify({
          success: true,
          company: {
            name: company.value,
            fullName: company.data.name?.full_with_opf || company.value,
            shortName: company.data.name?.short_with_opf || company.value,
            inn: company.data.inn,
            kpp: company.data.kpp,
            ogrn: company.data.ogrn,
            address: company.data.address?.unrestricted_value || null,
            management: company.data.management?.name || null,
            managementPosition: company.data.management?.post || null,
            status: company.data.state?.status || null,
            type: company.data.type, // LEGAL or INDIVIDUAL
            opf: company.data.opf?.short || null, // ООО, АО, ИП, etc.
            founders: founders,
            license: educationLicense ? {
              number: educationLicense.number || null,
              issueDate: educationLicense.issue_date || null,
              issueAuthority: educationLicense.issue_authority || null,
              activities: educationLicense.activities || [],
              validFrom: educationLicense.valid_from || null,
              validTo: educationLicense.valid_to || null,
            } : null,
            allLicenses: company.data.licenses?.map((l: any) => ({
              number: l.number,
              issueDate: l.issue_date,
              activities: l.activities,
            })) || [],
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, message: 'Компания не найдена' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
