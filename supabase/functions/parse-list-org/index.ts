import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ParsedCompany {
  name: string;
  inn?: string;
  ogrn?: string;
  city?: string;
  phone?: string;
  email?: string;
  website?: string;
  source_url?: string;
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

/** Очень терпимый парсер html со страницы поиска list-org.com */
function parseListOrgHtml(html: string): ParsedCompany[] {
  const companies: ParsedCompany[] = [];
  // Каждая карточка организации обёрнута в <div class="org"> ... </div>
  const orgBlocks = html.split(/<div\s+class="org[^"]*"/i).slice(1);
  console.log(`[parse-list-org] found ${orgBlocks.length} org blocks`);

  for (const blockRaw of orgBlocks) {
    // Берём только до закрытия следующего блока org
    const block = blockRaw.split(/<div\s+class="org[^"]*"/i)[0];

    // Название и URL карточки
    const linkMatch = block.match(/<a[^>]+href="(\/company\/[^"]+)"[^>]*>([^<]+)<\/a>/i);
    const name = linkMatch ? linkMatch[2].trim().replace(/\s+/g, ' ') : '';
    const sourceUrl = linkMatch ? `https://www.list-org.com${linkMatch[1]}` : undefined;
    if (!name) continue;

    // ИНН
    const innMatch = block.match(/ИНН[:\s]*<\/?[^>]*>?\s*(\d{10,12})/i) || block.match(/ИНН[\s:]*(\d{10,12})/i);
    const inn = innMatch ? innMatch[1] : undefined;

    // ОГРН
    const ogrnMatch = block.match(/ОГРН[:\s]*<\/?[^>]*>?\s*(\d{13,15})/i) || block.match(/ОГРН[\s:]*(\d{13,15})/i);
    const ogrn = ogrnMatch ? ogrnMatch[1] : undefined;

    // Город / адрес
    const addrMatch = block.match(/Адрес[:\s]*<\/?[^>]*>?\s*([^<]+)</i);
    let city: string | undefined;
    if (addrMatch) {
      const addr = addrMatch[1].trim();
      const cityMatch = addr.match(/(?:г\.?\s*|город\s+)([А-ЯЁA-Z][а-яёa-z\-]+)/i);
      city = cityMatch ? cityMatch[1] : addr.split(',')[1]?.trim();
    }

    // Телефон
    const phoneMatch = block.match(/(\+7[\s\-(]?\d{3}[\s\-)]?\s?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}|8[\s\-(]?\d{3}[\s\-)]?\s?\d{3}[\s\-]?\d{2}[\s\-]?\d{2})/);
    const phone = phoneMatch ? phoneMatch[1].replace(/\s+/g, ' ') : undefined;

    // Email
    const emailMatch = block.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    const email = emailMatch ? emailMatch[1] : undefined;

    // Сайт
    const siteMatch = block.match(/href="(https?:\/\/(?!www\.list-org\.com)[^"]+)"/i);
    const website = siteMatch ? siteMatch[1] : undefined;

    companies.push({ name, inn, ogrn, city, phone, email, website, source_url: sourceUrl });
  }

  return companies;
}

async function scrapeWithFirecrawl(url: string, apiKey: string): Promise<string> {
  const res = await fetch('https://api.firecrawl.dev/v2/scrape', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url,
      formats: ['html'],
      onlyMainContent: false,
      waitFor: 2500,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Firecrawl ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  }
  // SDK v2: result.html  | REST: data.html  | иногда data.data.html
  return (data.html as string) || (data.data?.html as string) || '';
}

async function enrichWithDadata(inn: string, supabaseUrl: string, supabaseKey: string): Promise<any | null> {
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/dadata-company`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ inn }),
    });
    if (!res.ok) {
      console.warn(`[dadata-company] ${inn} -> ${res.status}`);
      return null;
    }
    const data = await res.json();
    return data?.success ? data.company : null;
  } catch (e) {
    console.warn(`[dadata-company] ${inn} error:`, (e as Error).message);
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
    if (!FIRECRAWL_API_KEY) {
      return new Response(JSON.stringify({ error: 'FIRECRAWL_API_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { searchUrl, pages = 1 } = await req.json();
    if (!searchUrl || typeof searchUrl !== 'string') {
      return new Response(JSON.stringify({ error: 'searchUrl is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const pagesNum = Math.max(1, Math.min(20, Number(pages) || 1));
    console.log(`[parse-list-org] start url=${searchUrl} pages=${pagesNum}`);

    const allParsed: ParsedCompany[] = [];
    const errors: string[] = [];

    for (let p = 1; p <= pagesNum; p++) {
      const sep = searchUrl.includes('?') ? '&' : '?';
      const pageUrl = p === 1 ? searchUrl : `${searchUrl}${sep}p=${p}`;
      try {
        const html = await scrapeWithFirecrawl(pageUrl, FIRECRAWL_API_KEY);
        if (!html) {
          errors.push(`page ${p}: empty html`);
          continue;
        }
        const parsed = parseListOrgHtml(html);
        console.log(`[parse-list-org] page ${p} parsed ${parsed.length}`);
        allParsed.push(...parsed);
      } catch (e) {
        errors.push(`page ${p}: ${(e as Error).message}`);
      }
      if (p < pagesNum) await sleep(1500);
    }

    let inserted = 0, updated = 0, skipped = 0;
    const enrichedRows: any[] = [];

    for (const c of allParsed) {
      if (!c.inn) {
        skipped++;
        continue;
      }
      const dadata = await enrichWithDadata(c.inn, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      await sleep(350);

      const row: any = {
        inn: c.inn,
        ogrn: c.ogrn || dadata?.ogrn || null,
        name: dadata?.shortName || c.name,
        short_name: dadata?.shortName || null,
        full_name: dadata?.fullName || null,
        address: dadata?.address || null,
        city: c.city || null,
        phone: c.phone || null,
        email: c.email || null,
        website: c.website || null,
        director: dadata?.management || null,
        director_position: dadata?.managementPosition || null,
        status: dadata?.status || null,
        license_number: dadata?.license?.number || null,
        license_issue_date: dadata?.license?.issueDate
          ? new Date(dadata.license.issueDate).toISOString().slice(0, 10)
          : null,
        license_authority: dadata?.license?.issueAuthority || null,
        license_activities: dadata?.license?.activities || null,
        license_valid_to: dadata?.license?.validTo
          ? new Date(dadata.license.validTo).toISOString().slice(0, 10)
          : null,
        has_education_license: !!dadata?.license,
        source_url: c.source_url || null,
        raw_data: dadata || null,
        parsed_at: new Date().toISOString(),
      };

      const { data: existing } = await supabase
        .from('sales_companies_db')
        .select('id')
        .eq('inn', c.inn)
        .maybeSingle();

      if (existing) {
        const { error: upErr } = await supabase
          .from('sales_companies_db')
          .update(row)
          .eq('id', existing.id);
        if (upErr) errors.push(`update ${c.inn}: ${upErr.message}`);
        else updated++;
      } else {
        const { error: inErr } = await supabase
          .from('sales_companies_db')
          .insert(row);
        if (inErr) errors.push(`insert ${c.inn}: ${inErr.message}`);
        else inserted++;
      }
      enrichedRows.push(row);
    }

    return new Response(JSON.stringify({
      success: true,
      found: allParsed.length,
      inserted, updated, skipped,
      errors: errors.slice(0, 20),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown';
    console.error('[parse-list-org] fatal:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
