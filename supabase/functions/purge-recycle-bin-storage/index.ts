// Cron-driven purge of recycle bin items older than 30 days.
// Deletes both DB rows AND associated storage objects so files don't accumulate.
//
// Triggered by pg_cron daily at 03:00 UTC.
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "X-Sintagma-Function-Revision": "uc-foundation-20261018-v1",
};

const RETENTION_DAYS = 30;
// Keep both legacy files and immutable versions until UC-024 defines a reviewed
// retention workflow. Service-role Storage removal runs before DB deletion and
// would bypass the version protections even if the later row delete is denied.
const EXCLUDED_TABLES = ["org_documents", "document_signatures", "document_issuance_log", "education_document_records"] as const;

// Map of recycle-bin tables → which column holds the storage path/url + which bucket
type TableSpec = {
  table: string;
  pathColumns: string[]; // try in order
  bucket: string;
  urlMarker?: string; // when the column may hold a public URL
};

const TABLES: TableSpec[] = [
  { table: "company_documents", pathColumns: ["file_path", "file_url"], bucket: "billing-documents", urlMarker: "/billing-documents/" },
  { table: "org_billing_documents", pathColumns: ["file_url"], bucket: "billing-documents", urlMarker: "/billing-documents/" },
  { table: "incoming_documents", pathColumns: ["file_path", "file_url"], bucket: "incoming-documents", urlMarker: "/incoming-documents/" },
  { table: "data_subject_requests", pathColumns: [], bucket: "" }, // attachments are array, skip in v1
  { table: "commercial_proposals", pathColumns: [], bucket: "" }, // HTML in column, no file
];

function extractStoragePath(value: string | null, marker: string | undefined): string | null {
  if (!value) return null;
  // Strip query string if signed URL
  const clean = value.split("?")[0];
  if (!clean.startsWith("http")) return clean; // already a path
  if (!marker) return null;
  const idx = clean.indexOf(marker);
  if (idx === -1) return null;
  try {
    return decodeURIComponent(clean.substring(idx + marker.length));
  } catch {
    return clean.substring(idx + marker.length);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405, headers: { ...corsHeaders, "Content-Type": "application/json", Allow: "POST, OPTIONS" },
  });
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceKey || req.headers.get("Authorization") !== `Bearer ${serviceKey}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    serviceKey,
  );

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const report: Record<string, { rowsDeleted: number; filesDeleted: number; errors: string[] }> = {};

  for (const spec of TABLES) {
    const stat = { rowsDeleted: 0, filesDeleted: 0, errors: [] as string[] };
    report[spec.table] = stat;

    try {
      // Build select columns: id + path columns
      const selectCols = ["id", ...spec.pathColumns].join(", ");
      const { data: rows, error: selErr } = await supabase
        .from(spec.table as any)
        .select(selectCols)
        .lt("deleted_at", cutoff)
        .not("deleted_at", "is", null)
        .limit(500);

      if (selErr) {
        stat.errors.push(`select: ${selErr.message}`);
        continue;
      }
      if (!rows || rows.length === 0) continue;

      // Collect file paths
      const paths: string[] = [];
      for (const r of rows as any[]) {
        for (const col of spec.pathColumns) {
          const p = extractStoragePath(r[col] ?? null, spec.urlMarker);
          if (p) paths.push(p);
        }
      }

      // Delete files in chunks of 100
      if (paths.length > 0 && spec.bucket) {
        for (let i = 0; i < paths.length; i += 100) {
          const chunk = paths.slice(i, i + 100);
          const { error: delErr } = await supabase.storage.from(spec.bucket).remove(chunk);
          if (delErr) {
            stat.errors.push(`storage(${spec.bucket}): ${delErr.message}`);
          } else {
            stat.filesDeleted += chunk.length;
          }
        }
      }

      // Hard-delete DB rows
      const ids = (rows as any[]).map((r) => r.id);
      const { error: rowDelErr } = await supabase.from(spec.table as any).delete().in("id", ids);
      if (rowDelErr) {
        stat.errors.push(`row-delete: ${rowDelErr.message}`);
      } else {
        stat.rowsDeleted += ids.length;
      }
    } catch (e: any) {
      stat.errors.push(`fatal: ${e?.message || String(e)}`);
    }
  }

  console.log("purge-recycle-bin-storage report:", JSON.stringify(report));

  return new Response(JSON.stringify({ ok: true, cutoff, retentionDays: RETENTION_DAYS, excludedTables: EXCLUDED_TABLES, report }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 200,
  });
});
