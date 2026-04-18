import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const {
      token,
      pepAgreement, // { agreement_text, agreement_version, full_name, email }
      documentHash, // SHA-256 from client (или 'handwritten_scan')
      method = "pep", // 'pep' | 'handwritten_scan'
      handwrittenScanPath = null,
      handwrittenScanComment = null,
    } = body;

    if (!token || !pepAgreement) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (method === "pep" && !documentHash) {
      return new Response(JSON.stringify({ error: "documentHash required for PEP" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (method === "handwritten_scan" && !handwrittenScanPath) {
      return new Response(JSON.stringify({ error: "handwrittenScanPath required for scan method" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "unknown";
    const ua = req.headers.get("user-agent") || "unknown";

    // Load signature record
    const { data: sig, error: sigErr } = await supabase
      .from("document_signatures")
      .select("*")
      .eq("signature_token", token)
      .maybeSingle();

    if (sigErr || !sig) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (sig.status === "signed") {
      return new Response(JSON.stringify({ error: "Already signed", signatureId: sig.id }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (new Date(sig.expires_at) < new Date()) {
      await supabase.from("document_signatures").update({ status: "expired" }).eq("id", sig.id);
      return new Response(JSON.stringify({ error: "Token expired" }), { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // PEP-only: verify document hash matches stored content (if document_html exists)
    if (method === "pep" && sig.document_html) {
      const serverHash = await sha256Hex(sig.document_html);
      if (serverHash !== documentHash) {
        return new Response(JSON.stringify({ error: "Document hash mismatch — content tampered" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // 1. Create PEP agreement record
    const { data: pep, error: pepErr } = await supabase
      .from("pep_agreements")
      .insert({
        organization_id: sig.organization_id,
        user_id: sig.recipient_user_id,
        email: pepAgreement.email || sig.recipient_email,
        full_name: pepAgreement.full_name || sig.recipient_name,
        agreement_text: pepAgreement.agreement_text,
        agreement_version: pepAgreement.agreement_version || "v1.0",
        ip_address: ip,
        user_agent: ua,
      })
      .select("id")
      .single();

    if (pepErr) {
      console.error("PEP agreement insert error:", pepErr);
      return new Response(JSON.stringify({ error: "Failed to record PEP agreement" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 2. Update signature record
    const signedAt = new Date().toISOString();
    const updatePayload: Record<string, any> = {
      status: "signed",
      signed_at: signedAt,
      signed_ip: ip,
      signed_user_agent: ua,
      pep_agreement_id: pep.id,
      signature_method: method,
    };
    if (method === "pep") {
      updatePayload.document_hash = documentHash;
    } else {
      updatePayload.handwritten_scan_path = handwrittenScanPath;
      updatePayload.document_hash = `scan:${handwrittenScanPath}`;
      if (handwrittenScanComment) {
        // store comment alongside as rejection_reason isn't right — keep in pep_agreement_text already.
      }
    }

    const { error: updErr } = await supabase
      .from("document_signatures")
      .update(updatePayload)
      .eq("id", sig.id);

    if (updErr) {
      console.error("Signature update error:", updErr);
      return new Response(JSON.stringify({ error: "Failed to finalize signature" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({
      success: true,
      signatureId: sig.id,
      pepAgreementId: pep.id,
      signedAt,
      ip,
      method,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
