// OCR СНИЛС / паспорта через Lovable AI Gateway (Gemini 2.5 Flash Vision).
// Доступ только для организаций на тарифах professional/maximum.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ALLOWED_PLANS = new Set(["professional", "maximum"]);

function mimeFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  if (ext === "bmp") return "image/bmp";
  if (ext === "pdf") return "application/pdf";
  return "image/jpeg";
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function normalizeSnils(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const digits = v.replace(/\D/g, "");
  if (digits.length !== 11) return null;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 9)} ${digits.slice(9)}`;
}

function normalizeDate(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{2})[.\/-](\d{2})[.\/-](\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

function normalizePassportSeries(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const d = v.replace(/\D/g, "");
  if (d.length !== 4) return null;
  return `${d.slice(0, 2)} ${d.slice(2)}`;
}

function normalizePassportNumber(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const d = v.replace(/\D/g, "");
  if (d.length !== 6) return null;
  return d;
}

function normalizeDepartmentCode(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const d = v.replace(/\D/g, "");
  if (d.length !== 6) return null;
  return `${d.slice(0, 3)}-${d.slice(3)}`;
}

function cleanText(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim();
  return s.length > 0 ? s : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) {
      return new Response(JSON.stringify({ error: "Не авторизован" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) throw new Error("LOVABLE_API_KEY не настроен");

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: userRes } = await userClient.auth.getUser();
    const user = userRes?.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Не авторизован" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const filePath: string = body?.file_path;
    const docType: string = body?.doc_type || "snils";
    if (!filePath || typeof filePath !== "string") {
      return new Response(JSON.stringify({ error: "file_path обязателен" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Проверка плана организации, к которой относится документ.
    const { data: docRow, error: docErr } = await admin
      .from("student_identity_documents")
      .select("id, organization_id, user_id, file_path, type")
      .eq("file_path", filePath)
      .maybeSingle();
    if (docErr) throw docErr;
    if (!docRow) {
      return new Response(JSON.stringify({ error: "Документ не найден" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: org } = await admin
      .from("organizations")
      .select("subscription_plan")
      .eq("id", docRow.organization_id)
      .maybeSingle();
    const plan = (org?.subscription_plan || "free") as string;
    if (!ALLOWED_PLANS.has(plan)) {
      return new Response(
        JSON.stringify({
          error: "Распознавание доступно на тарифах «Профессиональный» и «Максимальный».",
          code: "plan_required",
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Скачиваем файл из приватного bucket.
    const { data: fileData, error: dlErr } = await admin.storage
      .from("student-documents")
      .download(filePath);
    if (dlErr || !fileData) throw dlErr || new Error("Не удалось скачать файл");

    const buf = new Uint8Array(await fileData.arrayBuffer());
    const mime = mimeFromPath(filePath);
    const b64 = bytesToBase64(buf);
    const dataUrl = `data:${mime};base64,${b64}`;

    const system = `Ты извлекаешь данные со скана российских документов. Возвращай СТРОГО валидный JSON без markdown и пояснений со следующей схемой: {"snils": string|null, "birth_date": string|null, "passport_series": string|null, "passport_number": string|null, "passport_issue_date": string|null, "passport_issued_by": string|null, "passport_department_code": string|null, "confidence": number}. СНИЛС — 11 цифр в формате "XXX-XXX-XXX XX". Даты — в формате "YYYY-MM-DD". passport_series — 4 цифры "XX XX". passport_number — 6 цифр без пробелов. passport_department_code — "XXX-XXX". passport_issued_by — полное наименование органа, выдавшего паспорт (без переносов строк). Если поля нет на изображении — null. confidence — 0..1.`;
    const userText =
      docType === "passport"
        ? "На изображении разворот/первая страница паспорта РФ. Извлеки: серию и номер паспорта, дату выдачи, кем выдан, код подразделения, дату рождения владельца. СНИЛС ставь null."
        : "На изображении скан СНИЛС (страховое свидетельство). Извлеки номер СНИЛС и дату рождения владельца. Паспортные поля ставь null.";

    const contentBlocks: any[] = [{ type: "text", text: userText }];
    if (mime === "application/pdf") {
      contentBlocks.push({
        type: "file",
        file: { filename: filePath.split("/").pop() || "doc.pdf", file_data: dataUrl },
      });
    } else {
      contentBlocks.push({ type: "image_url", image_url: { url: dataUrl } });
    }

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: contentBlocks },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (aiResp.status === 429) {
      return new Response(
        JSON.stringify({ error: "Слишком много запросов, попробуйте позже." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (aiResp.status === 402) {
      return new Response(
        JSON.stringify({ error: "Исчерпаны кредиты Lovable AI. Пополните баланс в настройках." }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("AI gateway error", aiResp.status, t);
      return new Response(JSON.stringify({ error: "Ошибка распознавания" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiResp.json();
    const raw = aiJson?.choices?.[0]?.message?.content || "{}";
    let parsed: any = {};
    try {
      parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      const m = String(raw).match(/\{[\s\S]*\}/);
      if (m) {
        try {
          parsed = JSON.parse(m[0]);
        } catch { /* ignore */ }
      }
    }

    const snils = normalizeSnils(parsed?.snils);
    const birth_date = normalizeDate(parsed?.birth_date);
    const passport_series = normalizePassportSeries(parsed?.passport_series);
    const passport_number = normalizePassportNumber(parsed?.passport_number);
    const passport_issue_date = normalizeDate(parsed?.passport_issue_date);
    const passport_issued_by = cleanText(parsed?.passport_issued_by);
    const passport_department_code = normalizeDepartmentCode(parsed?.passport_department_code);
    const confidence = typeof parsed?.confidence === "number" ? parsed.confidence : null;

    return new Response(
      JSON.stringify({
        snils,
        birth_date,
        passport_series,
        passport_number,
        passport_issue_date,
        passport_issued_by,
        passport_department_code,
        confidence,
        raw: parsed,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("ocr-snils error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Внутренняя ошибка" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
