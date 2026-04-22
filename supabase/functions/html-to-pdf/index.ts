// Edge-функция: HTML → PDF + загрузка в приватный bucket billing-documents.
// Возвращает path внутри bucket'а (не URL), фронт получает signed URL отдельно.
//
// Используется массовой генерацией договоров. PDF собирается из готового HTML
// через Browserless (если задан BROWSERLESS_TOKEN) или через простой фолбэк
// в виде текстового PDF (минимально-валидный документ для деградированного режима).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface Payload {
  html: string;
  fileName: string; // например: "Договор_2025-01-001.pdf"
  storagePath: string; // куда сохранить, например: "<orgId>/bulk/2025-01/Договор_2025-01-001.pdf"
}

async function renderPdfViaBrowserless(html: string, token: string): Promise<Uint8Array> {
  const resp = await fetch(`https://chrome.browserless.io/pdf?token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      html,
      options: {
        format: "A4",
        printBackground: true,
        margin: { top: "20mm", bottom: "20mm", left: "18mm", right: "18mm" },
      },
    }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Browserless error ${resp.status}: ${t}`);
  }
  const buf = await resp.arrayBuffer();
  return new Uint8Array(buf);
}

// Минимальный фолбэк: оборачиваем HTML в PDF-конверт. Это не настоящий рендер,
// но создаёт валидный PDF, чтобы пайплайн работал, пока не подключён Browserless.
function renderFallbackPdf(html: string, title: string): Uint8Array {
  const text = html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

  const lines: string[] = [];
  const maxChars = 90;
  for (let i = 0; i < text.length; i += maxChars) {
    lines.push(text.slice(i, i + maxChars));
  }

  // Простейший PDF (1 страница, шрифт Helvetica). Кириллицу Helvetica не поддерживает
  // в WinAnsi, поэтому это только аварийный фолбэк.
  const escape = (s: string) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const contentLines = [`BT /F1 12 Tf 50 800 Td (${escape(title)}) Tj ET`];
  let y = 770;
  for (const line of lines.slice(0, 50)) {
    contentLines.push(`BT /F1 10 Tf 50 ${y} Td (${escape(line)}) Tj ET`);
    y -= 14;
    if (y < 60) break;
  }
  const stream = contentLines.join("\n");
  const pdf =
    `%PDF-1.4\n` +
    `1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n` +
    `2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n` +
    `3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n` +
    `4 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream endobj\n` +
    `5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n` +
    `xref\n0 6\n0000000000 65535 f \ntrailer << /Size 6 /Root 1 0 R >>\nstartxref\n0\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Проверяем JWT — пользователь должен быть авторизован.
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: Payload = await req.json();
    if (!body.html || !body.fileName || !body.storagePath) {
      return new Response(JSON.stringify({ error: "html, fileName, storagePath required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const browserlessToken = Deno.env.get("BROWSERLESS_TOKEN");
    let pdfBytes: Uint8Array;
    let renderer: "browserless" | "fallback" = "fallback";
    if (browserlessToken) {
      try {
        pdfBytes = await renderPdfViaBrowserless(body.html, browserlessToken);
        renderer = "browserless";
      } catch (e) {
        console.error("Browserless render failed, using fallback:", e);
        pdfBytes = renderFallbackPdf(body.html, body.fileName);
      }
    } else {
      pdfBytes = renderFallbackPdf(body.html, body.fileName);
    }

    const admin = createClient(supabaseUrl, supabaseServiceKey);
    const { error: upErr } = await admin.storage
      .from("billing-documents")
      .upload(body.storagePath, pdfBytes, {
        contentType: "application/pdf",
        upsert: true,
      });
    if (upErr) throw upErr;

    return new Response(
      JSON.stringify({
        success: true,
        path: body.storagePath,
        renderer,
        size: pdfBytes.byteLength,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("html-to-pdf error", e);
    return new Response(JSON.stringify({ error: e?.message || "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
