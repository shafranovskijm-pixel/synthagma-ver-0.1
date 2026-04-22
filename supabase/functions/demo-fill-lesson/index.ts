// Fill ONE lesson for a demo course using GigaChat (text) + GigaChat (image).
// Protected by shared LOVABLE_API_KEY. Idempotent: skips lesson if already has content.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { callAIWithTools } from "../_shared/gigachat-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-demo-token",
};

const ALLOWED_COURSES: Record<string, { title: string; sources: Array<[string, string]> }> = {
  "32fb43d7-7dfa-44ef-bc92-97fd8938eec5": {
    title: "Бухгалтер: учёт, налоги и отчётность",
    sources: [
      ["КонсультантПлюс — НК РФ", "https://www.consultant.ru/document/cons_doc_LAW_19671/"],
      ["КонсультантПлюс — 402-ФЗ «О бухгалтерском учёте»", "https://www.consultant.ru/document/cons_doc_LAW_122855/"],
      ["Гарант.ру", "https://www.garant.ru/"],
      ["Klerk.ru", "https://www.klerk.ru/"],
      ["Главбух", "https://www.glavbukh.ru/"],
      ["Альпина", "https://alpinabook.ru/"],
      ["МИФ", "https://www.mann-ivanov-ferber.ru/"],
    ],
  },
  "3a6393da-113d-450d-b051-df5a8c6d7e81": {
    title: "Менеджер по маркетингу: digital и классический маркетинг",
    sources: [
      ["Альпина", "https://alpinabook.ru/"],
      ["МИФ", "https://www.mann-ivanov-ferber.ru/"],
      ["VC.ru", "https://vc.ru/marketing"],
      ["Cossa.ru", "https://www.cossa.ru/"],
      ["HBR Россия", "https://hbr-russia.ru/"],
      ["Think with Google", "https://www.thinkwithgoogle.com/"],
    ],
  },
  "fff5db1c-b440-4cbf-b2dd-14f46dcacaac": {
    title: "Юрист: договорная и претензионная работа",
    sources: [
      ["КонсультантПлюс — ГК РФ ч.1", "https://www.consultant.ru/document/cons_doc_LAW_5142/"],
      ["КонсультантПлюс — ГК РФ ч.2", "https://www.consultant.ru/document/cons_doc_LAW_9027/"],
      ["Гарант.ру", "https://www.garant.ru/"],
      ["Право.ру", "https://pravo.ru/"],
      ["Закон.ру", "https://zakon.ru/"],
      ["Альпина", "https://alpinabook.ru/"],
    ],
  },
};

function uid() {
  return crypto.randomUUID();
}

function buildBlocks(ld: any, imgUrl: string | null, sources: Array<[string, string]>) {
  const blocks: any[] = [];
  if (imgUrl) {
    blocks.push({ id: uid(), type: "image", url: imgUrl, caption: "", alt: "" });
  }
  blocks.push({ id: uid(), type: "paragraph", text: ld.intro_para });
  blocks.push({
    id: uid(), type: "callout", variant: "info",
    title: ld.callout_info.title, text: ld.callout_info.text,
  });
  const sections = ld.sections || [];
  sections.forEach((sec: any, i: number) => {
    blocks.push({ id: uid(), type: "heading", level: 2, text: sec.heading });
    (sec.paragraphs || []).forEach((p: string) => {
      blocks.push({ id: uid(), type: "paragraph", text: p });
    });
    if (i === 0 && ld.callout_tip) {
      blocks.push({ id: uid(), type: "callout", variant: "tip", title: ld.callout_tip.title, text: ld.callout_tip.text });
    }
    if (i === Math.floor(sections.length / 2) && ld.callout_warning) {
      blocks.push({ id: uid(), type: "callout", variant: "warning", title: ld.callout_warning.title, text: ld.callout_warning.text });
    }
  });
  blocks.push({ id: uid(), type: "divider" });
  blocks.push({ id: uid(), type: "heading", level: 2, text: "Разбор кейсов из практики" });
  blocks.push({
    id: uid(), type: "accordion",
    items: (ld.cases || []).map((c: any) => ({ id: uid(), title: c.title, content: c.content })),
  });
  blocks.push({ id: uid(), type: "divider" });
  blocks.push({ id: uid(), type: "heading", level: 2, text: "Проверьте себя" });
  blocks.push({
    id: uid(), type: "quiz",
    question: ld.mini_quiz.question,
    options: ld.mini_quiz.options,
    correctIndex: ld.mini_quiz.correct_index,
    explanation: ld.mini_quiz.explanation,
  });
  blocks.push({ id: uid(), type: "divider" });
  blocks.push({
    id: uid(), type: "callout", variant: "success",
    title: ld.summary.title, text: ld.summary.text,
  });
  blocks.push({ id: uid(), type: "heading", level: 3, text: "Куда дальше — материалы и источники" });
  const whitelist = new Set(sources.map((s) => s[1]));
  for (const src of (ld.picked_sources || [])) {
    const ok = whitelist.has(src.url) || sources.some(([_, u]) => src.url.startsWith(u.split("/").slice(0, 3).join("/")));
    if (ok) {
      blocks.push({ id: uid(), type: "button", label: src.label, url: src.url, variant: "outline" });
    }
  }
  return blocks;
}

const tool = {
  type: "function",
  function: {
    name: "build_lesson",
    description: "Сгенерировать структурированный урок",
    parameters: {
      type: "object",
      properties: {
        intro_para: { type: "string" },
        sections: {
          type: "array", minItems: 4, maxItems: 5,
          items: {
            type: "object",
            properties: {
              heading: { type: "string" },
              paragraphs: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 3 },
            },
            required: ["heading", "paragraphs"],
          },
        },
        callout_info: { type: "object", properties: { title: { type: "string" }, text: { type: "string" } }, required: ["title", "text"] },
        callout_tip: { type: "object", properties: { title: { type: "string" }, text: { type: "string" } }, required: ["title", "text"] },
        callout_warning: { type: "object", properties: { title: { type: "string" }, text: { type: "string" } }, required: ["title", "text"] },
        cases: {
          type: "array", minItems: 1, maxItems: 2,
          items: { type: "object", properties: { title: { type: "string" }, content: { type: "string" } }, required: ["title", "content"] },
        },
        mini_quiz: {
          type: "object",
          properties: {
            question: { type: "string" },
            options: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 4 },
            correct_index: { type: "integer", minimum: 0, maximum: 3 },
            explanation: { type: "string" },
          },
          required: ["question", "options", "correct_index", "explanation"],
        },
        picked_sources: {
          type: "array", minItems: 2, maxItems: 3,
          items: { type: "object", properties: { label: { type: "string" }, url: { type: "string" } }, required: ["label", "url"] },
        },
        summary: { type: "object", properties: { title: { type: "string" }, text: { type: "string" } }, required: ["title", "text"] },
        illustration_prompt: { type: "string" },
      },
      required: ["intro_para", "sections", "callout_info", "callout_tip", "callout_warning", "cases", "mini_quiz", "picked_sources", "summary", "illustration_prompt"],
    },
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const token = req.headers.get("x-demo-token");
    if (!token || token !== Deno.env.get("LOVABLE_API_KEY")) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const { lesson_id, skip_image } = await req.json();
    if (!lesson_id) {
      return new Response(JSON.stringify({ error: "lesson_id required" }), { status: 400, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: lesson, error: lerr } = await supabase
      .from("lessons")
      .select("id, title, content, type, module:course_modules!inner(title, course_id)")
      .eq("id", lesson_id)
      .single();
    if (lerr || !lesson) {
      return new Response(JSON.stringify({ error: "lesson not found" }), { status: 404, headers: corsHeaders });
    }
    // @ts-ignore
    const courseId = lesson.module?.course_id as string;
    const course = ALLOWED_COURSES[courseId];
    if (!course) {
      return new Response(JSON.stringify({ error: "course not allowed" }), { status: 403, headers: corsHeaders });
    }
    if (lesson.type !== "text") {
      return new Response(JSON.stringify({ error: "only text lessons" }), { status: 400, headers: corsHeaders });
    }
    const existing = lesson.content;
    if (Array.isArray(existing) && existing.length > 0) {
      return new Response(JSON.stringify({ ok: true, skipped: "already filled", blocks: existing.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sourcesTxt = course.sources.map(([n, u]) => `- ${n}: ${u}`).join("\n");
    const userMsg = `Курс: ${course.title}\n` +
      // @ts-ignore
      `Модуль: ${lesson.module.title}\n` +
      `Урок: ${lesson.title}\n\n` +
      `БЕЛЫЙ СПИСОК ИСТОЧНИКОВ (выбери 2-3 для кнопок):\n${sourcesTxt}\n\n` +
      `Создай полный учебный материал для российской практики 2024-2025: реальные нормы, ` +
      `цифры, даты. Минимум 700 слов основного текста. Никаких ссылок вне белого списка. ` +
      `illustration_prompt — английский, 16:9, minimalist editorial, teal/cyan palette, без людей и текста.`;

    const systemMsg = "Ты — преподаватель курса профпереподготовки. Создаёшь подробный, " +
      "фактологически точный материал для специалистов в России. " +
      "Все ссылки берёшь только из белого списка.";

    console.log(`[demo-fill-lesson] generating text for ${lesson_id}`);
    const ld = await callAIWithTools(
      [{ role: "system", content: systemMsg }, { role: "user", content: userMsg }],
      tool,
      "GigaChat-Max",
      "google/gemini-2.5-flash",
      "gigachat",
    );

    let imgUrl: string | null = null;
    if (!skip_image) {
      try {
        console.log(`[demo-fill-lesson] generating image for ${lesson_id}`);
        const imgRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/generate-image`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            prompt: ld.illustration_prompt + " 16:9, minimalist editorial illustration, teal and cyan palette, soft shadows, no text, no humans.",
            provider: "gigachat",
          }),
        });
        if (imgRes.ok) {
          const j = await imgRes.json();
          imgUrl = j.url || null;
        } else {
          console.warn(`[demo-fill-lesson] image failed: ${imgRes.status} ${(await imgRes.text()).slice(0, 200)}`);
        }
      } catch (e) {
        console.warn(`[demo-fill-lesson] image error:`, e);
      }
    }

    const blocks = buildBlocks(ld, imgUrl, course.sources);

    const { error: uerr } = await supabase
      .from("lessons")
      .update({ content: blocks, updated_at: new Date().toISOString() })
      .eq("id", lesson_id);
    if (uerr) throw uerr;

    return new Response(JSON.stringify({ ok: true, blocks: blocks.length, has_image: !!imgUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[demo-fill-lesson] error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
