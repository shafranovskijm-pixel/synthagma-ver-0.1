// Faithful HTML -> PDF only. A failed renderer leaves existing documents intact.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { AccessError, accessErrorResponse, readObject, requireActiveUser } from "../_shared/privileged-access.ts";
import { billingDocumentTarget, requireDocumentWrite } from "../_shared/document-operation-access.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "X-Sintagma-Function-Revision": "uc-permissions-20261018-v2",
  "Cache-Control": "no-store",
};

async function renderPdf(html: string, token: string): Promise<Uint8Array> {
  let response: Response;
  try {
    response = await fetch(`https://chrome.browserless.io/pdf?token=${encodeURIComponent(token)}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html, options: { format: "A4", printBackground: true,
        margin: { top: "20mm", bottom: "20mm", left: "18mm", right: "18mm" } } }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    throw new AccessError(503, "Не удалось сформировать PDF. Повторите позже.");
  }
  if (!response.ok) throw new AccessError(503, "Сервис формирования PDF временно недоступен");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length < 5 || bytes.length > 50_000_000 ||
      new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") {
    throw new AccessError(503, "Сервис не вернул корректный PDF; документ не сохранён");
  }
  return bytes;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    await requireActiveUser(req, admin);
    const target = billingDocumentTarget(await readObject(req));
    const userDb = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization")! } },
    });
    await requireDocumentWrite(userDb, target.organizationId, target.groupId);
    const token = Deno.env.get("BROWSERLESS_TOKEN");
    if (!token) throw new AccessError(503, "Сервис формирования PDF не настроен. Документ не сохранён.");
    const bytes = await renderPdf(target.html, token);
    // User Storage RLS remains an additional boundary. Never overwrite an artifact.
    const { error } = await userDb.storage.from("billing-documents").upload(target.storagePath, bytes, {
      contentType: "application/pdf", upsert: false,
    });
    if (error) throw new AccessError(409, "Не удалось сохранить новый PDF. Существующие файлы не изменены.");
    return new Response(JSON.stringify({ success: true, path: target.storagePath,
      renderer: "browserless", size: bytes.byteLength }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return accessErrorResponse(error, corsHeaders);
  }
});
