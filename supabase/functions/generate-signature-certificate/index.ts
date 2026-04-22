import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function buildCertificateHtml(args: {
  signatureId: string;
  documentTitle: string;
  documentType: string;
  documentHash: string;
  signerName: string;
  signerEmail: string;
  signedAt: string;
  signedIp: string;
  signedUserAgent: string;
  pepAgreementText: string;
  pepAgreementVersion: string;
  organizationName: string;
}): string {
  const fmt = new Date(args.signedAt).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });
  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>Сертификат подписи</title>
<style>
  @page { size: A4; margin: 18mm; }
  body { font-family: -apple-system, "Segoe UI", Arial, sans-serif; color: #111; font-size: 11pt; line-height: 1.5; }
  h1 { font-size: 18pt; text-align: center; margin: 0 0 4mm; }
  h2 { font-size: 12pt; margin: 6mm 0 2mm; border-bottom: 1px solid #999; padding-bottom: 1mm; }
  table { width: 100%; border-collapse: collapse; margin: 2mm 0; }
  td { padding: 2mm 3mm; vertical-align: top; border-bottom: 1px dashed #ccc; }
  td.label { width: 38%; color: #555; }
  td.value { font-weight: 500; word-break: break-word; }
  .hash { font-family: "SFMono-Regular", Consolas, monospace; font-size: 9pt; word-break: break-all; }
  .footer { margin-top: 8mm; font-size: 9pt; color: #666; text-align: center; }
  .pep { margin-top: 4mm; padding: 4mm; background: #f7f7f7; border-left: 3px solid #444; font-size: 10pt; white-space: pre-wrap; }
</style></head><body>
<h1>Сертификат электронной подписи</h1>
<p style="text-align:center;color:#666;margin:0 0 6mm">Простая электронная подпись (ПЭП) — 63-ФЗ «Об электронной подписи»</p>

<h2>Документ</h2>
<table>
  <tr><td class="label">Наименование</td><td class="value">${escapeHtml(args.documentTitle)}</td></tr>
  <tr><td class="label">Тип</td><td class="value">${escapeHtml(args.documentType)}</td></tr>
  <tr><td class="label">SHA-256</td><td class="value hash">${escapeHtml(args.documentHash)}</td></tr>
  <tr><td class="label">ID подписания</td><td class="value hash">${escapeHtml(args.signatureId)}</td></tr>
</table>

<h2>Подписант</h2>
<table>
  <tr><td class="label">ФИО</td><td class="value">${escapeHtml(args.signerName)}</td></tr>
  <tr><td class="label">Email</td><td class="value">${escapeHtml(args.signerEmail)}</td></tr>
</table>

<h2>Получатель документа</h2>
<table>
  <tr><td class="label">Организация</td><td class="value">${escapeHtml(args.organizationName)}</td></tr>
</table>

<h2>Параметры подписания</h2>
<table>
  <tr><td class="label">Дата и время (МСК)</td><td class="value">${escapeHtml(fmt)}</td></tr>
  <tr><td class="label">IP-адрес</td><td class="value">${escapeHtml(args.signedIp)}</td></tr>
  <tr><td class="label">User-Agent</td><td class="value">${escapeHtml(args.signedUserAgent)}</td></tr>
  <tr><td class="label">Версия соглашения о ПЭП</td><td class="value">${escapeHtml(args.pepAgreementVersion)}</td></tr>
</table>

<h2>Текст соглашения о ПЭП</h2>
<div class="pep">${escapeHtml(args.pepAgreementText)}</div>

<div class="footer">
  Сертификат сформирован автоматически системой «Синтагма». Действителен без печати и подписи.<br>
  Подлинность можно проверить по ID подписания в кабинете организации.
</div>
</body></html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { signatureId } = await req.json();
    if (!signatureId) {
      return new Response(JSON.stringify({ error: "signatureId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: sig, error: sigErr } = await supabase
      .from("document_signatures")
      .select("*, pep_agreements(*), organizations:organization_id(name)")
      .eq("id", signatureId)
      .maybeSingle();

    if (sigErr || !sig) {
      return new Response(JSON.stringify({ error: "Signature not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (sig.status !== "signed") {
      return new Response(JSON.stringify({ error: "Signature is not finalized" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const pep = (sig as any).pep_agreements;
    const html = buildCertificateHtml({
      signatureId: sig.id,
      documentTitle: sig.document_title,
      documentType: sig.document_type,
      documentHash: sig.document_hash || "—",
      signerName: pep?.full_name || sig.recipient_name,
      signerEmail: pep?.email || sig.recipient_email,
      signedAt: sig.signed_at!,
      signedIp: sig.signed_ip || "—",
      signedUserAgent: sig.signed_user_agent || "—",
      pepAgreementText: pep?.agreement_text || "",
      pepAgreementVersion: pep?.agreement_version || "v1.0",
      organizationName: (sig as any).organizations?.name || "",
    });

    // Сохраняем HTML-сертификат в storage (PDF-конвертация по запросу пользователя)
    const path = `${sig.organization_id}/certificates/${sig.id}.html`;
    const blob = new Blob([html], { type: "text/html; charset=utf-8" });
    const { error: upErr } = await supabase.storage
      .from("signed-documents")
      .upload(path, blob, { upsert: true, contentType: "text/html; charset=utf-8" });
    if (upErr) {
      console.error("upload err:", upErr);
      return new Response(JSON.stringify({ error: "Failed to save certificate" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Записываем путь сертификата
    if (!sig.signed_document_path) {
      await supabase.from("document_signatures")
        .update({ signed_document_path: path })
        .eq("id", sig.id);
    }

    // Вернём HTML напрямую — клиент откроет/скачает
    return new Response(html, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `inline; filename="signature-certificate-${sig.id}.html"`,
        "X-Certificate-Path": path,
      },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
