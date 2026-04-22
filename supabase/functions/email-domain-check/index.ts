// Проверка SPF / DKIM / DMARC через Google DNS-over-HTTPS (без зависимостей)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DOH = "https://dns.google/resolve";

async function dnsTxt(name: string): Promise<string[]> {
  try {
    const r = await fetch(`${DOH}?name=${encodeURIComponent(name)}&type=TXT`, {
      headers: { Accept: "application/dns-json" },
    });
    if (!r.ok) return [];
    const j = await r.json();
    return (j.Answer || [])
      .filter((a: any) => a.type === 16)
      .map((a: any) => String(a.data || "").replace(/^"|"$/g, "").replace(/"\s*"/g, ""));
  } catch {
    return [];
  }
}

interface DomainReport {
  domain: string;
  spf: { found: boolean; value: string | null; status: "ok" | "warn" | "missing"; note: string };
  dmarc: { found: boolean; value: string | null; policy: string | null; status: "ok" | "warn" | "missing"; note: string };
  dkim: { selectors_checked: string[]; found_selectors: string[]; status: "ok" | "warn" | "missing"; note: string };
  mx: { found: boolean; records: string[] };
  score: number;
  recommendations: string[];
}

async function dnsMx(name: string): Promise<string[]> {
  try {
    const r = await fetch(`${DOH}?name=${encodeURIComponent(name)}&type=MX`, {
      headers: { Accept: "application/dns-json" },
    });
    if (!r.ok) return [];
    const j = await r.json();
    return (j.Answer || []).filter((a: any) => a.type === 15).map((a: any) => String(a.data || ""));
  } catch {
    return [];
  }
}

async function checkDomain(domain: string): Promise<DomainReport> {
  domain = String(domain).trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0];
  const recs: string[] = [];

  // SPF
  const txts = await dnsTxt(domain);
  const spfRecord = txts.find((t) => t.toLowerCase().startsWith("v=spf1")) || null;
  let spfStatus: "ok" | "warn" | "missing" = "missing";
  let spfNote = "SPF-запись не найдена. Письма будут отмечаться как подозрительные.";
  if (spfRecord) {
    if (/(\s|^)\-all(\s|$)/i.test(spfRecord)) { spfStatus = "ok"; spfNote = "SPF настроен жёстко (-all). Хороший уровень защиты."; }
    else if (/(\s|^)~all(\s|$)/i.test(spfRecord)) { spfStatus = "ok"; spfNote = "SPF настроен мягко (~all). Допустимо."; }
    else if (/(\s|^)\?all(\s|$)/i.test(spfRecord)) { spfStatus = "warn"; spfNote = "SPF в нейтральном режиме (?all) — слабая защита."; }
    else { spfStatus = "warn"; spfNote = "SPF без явного all-механизма."; }
  } else {
    recs.push(`Добавьте TXT-запись SPF: v=spf1 include:_spf.mail.ru include:_spf.yandex.ru ~all (адаптируйте под вашего SMTP-провайдера)`);
  }

  // DMARC
  const dmarcTxts = await dnsTxt(`_dmarc.${domain}`);
  const dmarcRecord = dmarcTxts.find((t) => t.toLowerCase().startsWith("v=dmarc1")) || null;
  let dmarcStatus: "ok" | "warn" | "missing" = "missing";
  let dmarcNote = "DMARC не настроен. Уязвимы к подмене отправителя.";
  let policy: string | null = null;
  if (dmarcRecord) {
    const m = /p\s*=\s*(none|quarantine|reject)/i.exec(dmarcRecord);
    policy = m ? m[1].toLowerCase() : null;
    if (policy === "reject") { dmarcStatus = "ok"; dmarcNote = "DMARC: p=reject — максимальная защита."; }
    else if (policy === "quarantine") { dmarcStatus = "ok"; dmarcNote = "DMARC: p=quarantine — хорошая защита."; }
    else if (policy === "none") { dmarcStatus = "warn"; dmarcNote = "DMARC: p=none — только мониторинг, защиты нет."; }
    else { dmarcStatus = "warn"; dmarcNote = "DMARC найден, но политика не распознана."; }
  } else {
    recs.push(`Добавьте TXT-запись _dmarc.${domain}: v=DMARC1; p=quarantine; rua=mailto:postmaster@${domain}`);
  }

  // DKIM (проверяем популярные селекторы)
  const selectors = ["default", "selector1", "selector2", "google", "mail", "k1", "s1", "dkim"];
  const dkimFound: string[] = [];
  for (const sel of selectors) {
    const t = await dnsTxt(`${sel}._domainkey.${domain}`);
    if (t.some((s) => s.toLowerCase().includes("v=dkim1") || s.toLowerCase().includes("k=rsa"))) {
      dkimFound.push(sel);
    }
  }
  let dkimStatus: "ok" | "warn" | "missing" = dkimFound.length > 0 ? "ok" : "missing";
  let dkimNote = dkimFound.length > 0
    ? `DKIM найден для селекторов: ${dkimFound.join(", ")}.`
    : "DKIM не найден среди стандартных селекторов. Возможно, используется нестандартный селектор.";
  if (dkimFound.length === 0) {
    recs.push(`Настройте DKIM в почтовом провайдере (Yandex/Mail.ru/Google) и добавьте указанную TXT-запись на _domainkey-поддомен.`);
  }

  // MX
  const mx = await dnsMx(domain);

  // Score
  let score = 0;
  if (spfStatus === "ok") score += 35;
  else if (spfStatus === "warn") score += 15;
  if (dmarcStatus === "ok") score += 35;
  else if (dmarcStatus === "warn") score += 15;
  if (dkimStatus === "ok") score += 25;
  if (mx.length > 0) score += 5;

  return {
    domain,
    spf: { found: !!spfRecord, value: spfRecord, status: spfStatus, note: spfNote },
    dmarc: { found: !!dmarcRecord, value: dmarcRecord, policy, status: dmarcStatus, note: dmarcNote },
    dkim: { selectors_checked: selectors, found_selectors: dkimFound, status: dkimStatus, note: dkimNote },
    mx: { found: mx.length > 0, records: mx },
    score,
    recommendations: recs,
  };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { domain } = await req.json();
    if (!domain || typeof domain !== "string") {
      return new Response(JSON.stringify({ error: "domain required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const report = await checkDomain(domain);
    return new Response(JSON.stringify(report), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
