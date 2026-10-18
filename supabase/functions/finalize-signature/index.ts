import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { finalizeSignatureRequest } from "../_shared/signature-finalizer.ts";

serve((req) => finalizeSignatureRequest(req, {
  db: createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!),
  supabaseUrl: Deno.env.get("SUPABASE_URL")!,
  generateCertificate: async (signatureId) => {
    const response = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/generate-signature-certificate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
      body: JSON.stringify({ signatureId }),
    });
    if (!response.ok) throw new Error("Certificate generation failed");
    await response.arrayBuffer();
  },
}));
