import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/* ── Markdown → JSON blocks (mirrors client-side markdownToBlocks) ── */

interface ContentBlock {
  id: string;
  type: string;
  content: string;
}

function mkId() {
  return crypto.randomUUID();
}

function markdownToBlocks(md: string): ContentBlock[] {
  if (!md || typeof md !== "string") return [];
  const trimmed = md.trim();
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].type) return parsed;
    } catch { /* not JSON */ }
  }

  const blocks: ContentBlock[] = [];
  const lines = md.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    if (/^## /.test(line)) {
      blocks.push({ id: mkId(), type: "heading2", content: line.replace(/^## /, "").trim() });
      i++; continue;
    }
    if (/^# /.test(line)) {
      blocks.push({ id: mkId(), type: "heading1", content: line.replace(/^# /, "").trim() });
      i++; continue;
    }
    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({ id: mkId(), type: "quote", content: quoteLines.join("\n") });
      continue;
    }
    if (/^[-*]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s/, ""));
        i++;
      }
      blocks.push({ id: mkId(), type: "bulletList", content: items.join("\n") });
      continue;
    }
    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, ""));
        i++;
      }
      blocks.push({ id: mkId(), type: "numberedList", content: items.map(t => `<li>${t}</li>`).join("") });
      continue;
    }
    if (/^[-*_]{3,}\s*$/.test(line)) {
      blocks.push({ id: mkId(), type: "divider", content: "" });
      i++; continue;
    }

    // Paragraph
    const paraLines: string[] = [];
    while (
      i < lines.length && lines[i].trim() &&
      !/^#{1,2}\s/.test(lines[i]) && !/^>\s?/.test(lines[i]) &&
      !/^[-*]\s/.test(lines[i]) && !/^\d+\.\s/.test(lines[i]) &&
      !/^[-*_]{3,}\s*$/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length) {
      let html = paraLines.join(" ")
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>");
      blocks.push({ id: mkId(), type: "paragraph", content: html });
    }
  }

  return blocks;
}

function blocksToJson(blocks: ContentBlock[]): string {
  return JSON.stringify(blocks);
}

function isAlreadyJsonBlocks(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed.startsWith("[")) return false;
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) && (parsed.length === 0 || (parsed[0] && typeof parsed[0].type === "string"));
  } catch { return false; }
}

/* ── Handler ── */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceRoleKey);

    const { batch_size = 200, dry_run = false } = await req.json().catch(() => ({}));

    // Fetch lessons that have content but it's NOT valid JSON blocks
    const { data: lessons, error } = await sb
      .from("lessons")
      .select("id, title, content")
      .not("content", "is", null)
      .neq("content", "")
      .neq("content", "[]")
      .in("type", ["text", "practice"])
      .limit(batch_size);

    if (error) throw error;

    // Filter to only markdown lessons (not already JSON)
    const markdownLessons = (lessons || []).filter(l => l.content && !isAlreadyJsonBlocks(l.content));

    if (dry_run) {
      return new Response(JSON.stringify({
        total_found: markdownLessons.length,
        sample_titles: markdownLessons.slice(0, 10).map(l => l.title),
        dry_run: true,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let converted = 0;
    let failed = 0;

    for (const lesson of markdownLessons) {
      try {
        const blocks = markdownToBlocks(lesson.content);
        if (blocks.length === 0) { failed++; continue; }
        const jsonContent = blocksToJson(blocks);
        const { error: upErr } = await sb
          .from("lessons")
          .update({ content: jsonContent })
          .eq("id", lesson.id);
        if (upErr) { failed++; continue; }
        converted++;
      } catch {
        failed++;
      }
    }

    return new Response(JSON.stringify({
      converted,
      failed,
      remaining: markdownLessons.length - converted - failed,
      total_processed: markdownLessons.length,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
