import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BASE = "https://ipo.msk.ru";
const ROOT = `${BASE}/professionalnaja-perepodgotovka/`;

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&laquo;/g, "«")
    .replace(/&raquo;/g, "»")
    .replace(/&quot;/g, '"')
    .replace(/&#171;/g, "«")
    .replace(/&#187;/g, "»")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&[a-z]+;/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept": "text/html" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
}

function absoluteUrl(href: string): string {
  if (href.startsWith("http")) return href;
  if (href.startsWith("/")) return BASE + href;
  return BASE + "/" + href;
}

// Извлекает категории первого уровня со страницы /professionalnaja-perepodgotovka/
function extractCategories(html: string): { title: string; url: string }[] {
  const out: { title: string; url: string }[] = [];
  const seen = new Set<string>();
  // Категории — это ссылки внутри основного блока каталога
  const re = /<a[^>]+href="([^"]*\/professionalnaja-perepodgotovka\/[a-z0-9-]+\/?)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const url = absoluteUrl(m[1]);
    if (seen.has(url)) continue;
    // Пропускаем сам корень и пагинацию
    if (url.replace(/\/$/, "") === ROOT.replace(/\/$/, "")) continue;
    if (/page-\d+/i.test(url)) continue;
    const title = decodeEntities(m[2]);
    if (!title || title.length < 3 || title.length > 120) continue;
    seen.add(url);
    out.push({ title, url });
  }
  return out;
}

// Извлекает курсы из страницы категории/подкатегории
function extractCourses(html: string, parent: string, sub: string | null): {
  title: string; url: string; hours: number | null; price: number | null;
}[] {
  const out: { title: string; url: string; hours: number | null; price: number | null }[] = [];
  const seen = new Set<string>();

  // Паттерн карточки курса: ссылка с заголовком, рядом упоминание часов и цены
  const linkRe = /<a[^>]+href="([^"]+)"[^>]*>\s*<[^>]*>?\s*([^<]{15,200})<\/[^>]*>/gi;
  let m;
  while ((m = linkRe.exec(html)) !== null) {
    const href = m[1];
    if (!/professionalnaja-perepodgotovka/.test(href)) continue;
    if (/page-\d+/i.test(href)) continue;
    const url = absoluteUrl(href);
    if (seen.has(url)) continue;
    const title = decodeEntities(m[2]);
    // Игнорируем короткие/служебные ссылки
    if (title.length < 15) continue;
    if (/^(подробнее|читать|заказать|подать заявку)/i.test(title)) continue;
    seen.add(url);
    out.push({ title, url, hours: null, price: null });
  }

  // Простая эвристика для часов: ищем "NNN ч." или "NNN час" в окрестности
  const hoursRe = /(\d{2,4})\s*(?:ак\.\s*)?час/gi;
  const allHours: number[] = [];
  let h;
  while ((h = hoursRe.exec(html)) !== null) {
    const v = parseInt(h[1], 10);
    if (v >= 16 && v <= 5000) allHours.push(v);
  }
  // Если число найденных часов совпадает с числом курсов — мапим по индексу
  if (allHours.length === out.length) {
    out.forEach((c, i) => (c.hours = allHours[i]));
  }

  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const limit: number = Math.min(body.limit ?? 1000, 2000);
    const dryRun: boolean = !!body.dryRun;

    const stats = { categoriesFound: 0, coursesFound: 0, inserted: 0, skipped: 0, errors: 0 };
    const errors: string[] = [];

    // Шаг 1 — корневой каталог + до 3 страниц пагинации
    const rootPages = [ROOT, `${ROOT}page-2/`, `${ROOT}page-3/`];
    const categories: { title: string; url: string }[] = [];
    const seenCat = new Set<string>();
    for (const pageUrl of rootPages) {
      try {
        const html = await fetchHtml(pageUrl);
        for (const c of extractCategories(html)) {
          if (seenCat.has(c.url)) continue;
          seenCat.add(c.url);
          categories.push(c);
        }
        await new Promise(r => setTimeout(r, 1000));
      } catch (e) {
        errors.push(`Root ${pageUrl}: ${(e as Error).message}`);
      }
    }
    stats.categoriesFound = categories.length;

    // Шаг 2 — обходим каждую категорию
    const allCourses: {
      title: string; url: string; parent: string; sub: string | null; hours: number | null; price: number | null;
    }[] = [];

    for (const cat of categories) {
      if (allCourses.length >= limit) break;
      try {
        const html = await fetchHtml(cat.url);
        // Подкатегории внутри категории
        const subCats = extractCategories(html).filter(s => s.url.replace(BASE, "").split("/").length >= 4);

        if (subCats.length > 0) {
          for (const sub of subCats) {
            if (allCourses.length >= limit) break;
            try {
              const subHtml = await fetchHtml(sub.url);
              const courses = extractCourses(subHtml, cat.title, sub.title);
              for (const c of courses) {
                allCourses.push({ ...c, parent: cat.title, sub: sub.title });
              }
              await new Promise(r => setTimeout(r, 800));
            } catch (e) {
              errors.push(`Sub ${sub.url}: ${(e as Error).message}`);
            }
          }
        } else {
          // Курсы прямо в категории
          const courses = extractCourses(html, cat.title, null);
          for (const c of courses) {
            allCourses.push({ ...c, parent: cat.title, sub: null });
          }
        }
        await new Promise(r => setTimeout(r, 800));
      } catch (e) {
        errors.push(`Cat ${cat.url}: ${(e as Error).message}`);
        stats.errors++;
      }
    }

    stats.coursesFound = allCourses.length;

    // Шаг 3 — записываем в БД пакетами
    if (!dryRun && allCourses.length > 0) {
      const chunkSize = 100;
      for (let i = 0; i < allCourses.length; i += chunkSize) {
        const chunk = allCourses.slice(i, i + chunkSize).map(c => ({
          title: c.title.slice(0, 500),
          parent_category: c.parent,
          sub_category: c.sub,
          hours: c.hours,
          price_reference: c.price,
          source_url: c.url,
          status: "pending",
        }));
        const { error, count } = await supabase
          .from("marketplace_import_catalog")
          .upsert(chunk, { onConflict: "source_url", ignoreDuplicates: true, count: "exact" });
        if (error) {
          errors.push(`Insert chunk ${i}: ${error.message}`);
          stats.errors++;
        } else {
          stats.inserted += count ?? chunk.length;
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, stats, errors: errors.slice(0, 30), categories: categories.slice(0, 80).map(c => c.title) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("import-ipo-catalog error:", e);
    return new Response(
      JSON.stringify({ success: false, error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
