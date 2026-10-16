import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AccessError, accessErrorResponse, checked, readObject, requireActiveUser, requirePlatformAdmin, requireUuid } from "../_shared/privileged-access.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const actor = await requireActiveUser(req, supabase);
    await requirePlatformAdmin(supabase, actor);
    const body = await readObject(req);
    const organizationId = requireUuid(body.organizationId, "organizationId");
    const urls = body.urls;
    if (!Array.isArray(urls) || urls.length === 0 || urls.some(url => typeof url !== "string" || !url.trim())) {
      throw new AccessError(400, "Укажите адреса курсов");
    }

    // Get and decrypt credentials
    const { data: creds, error: credentialsError } = await supabase
      .from("organization_credentials")
      .select("login_email, login_password")
      .eq("organization_id", organizationId)
      .maybeSingle();
    checked({ data: creds, error: credentialsError });

    if (!creds) {
      return new Response(JSON.stringify({ error: "No credentials found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: decryptedPassword, error: decryptErr } = await supabase.rpc("decrypt_password", {
      p_text: creds.login_password,
    });

    console.log(`[reimport] Credentials decrypted: ${!decryptErr && Boolean(decryptedPassword)}`);

    if (!decryptedPassword) {
      // Fallback: try using get_decrypted_org_credentials
      const { data: decCreds, error: decErr } = await supabase.rpc("get_decrypted_org_credentials", {
        p_organization_id: organizationId,
      });
      console.log(`[reimport] Fallback credentials available: ${!decErr && Boolean(decCreds?.length)}`);
      
      if (decErr || !decCreds || decCreds.length === 0) {
        return new Response(JSON.stringify({ error: "Could not decrypt credentials" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      var login = decCreds[0].login_email;
      var password = decCreds[0].login_password;
    } else {
      var login = creds.login_email;
      var password = decryptedPassword;
    }

    console.log(`[reimport] Starting ${urls.length} courses for org ${organizationId}`);

    const results: any[] = [];

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i].trim();
      console.log(`[reimport] ${i + 1}/${urls.length}: ${url}`);

      try {
        const parseResponse = await fetch(
          `${supabaseUrl}/functions/v1/parse-skillspace-course`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: req.headers.get("Authorization")!,
              apikey: anonKey,
            },
            body: JSON.stringify({
              url,
              login,
              password,
              organizationId,
            }),
          }
        );

        const parseResult = await parseResponse.json();

        if (!parseResponse.ok || parseResult.error) {
          console.error(`[reimport] Error for ${url}:`, parseResult.error);
          results.push({ url, status: "error", error: parseResult.error || `HTTP ${parseResponse.status}` });
        } else {
          console.log(`[reimport] Success for ${url}: ${parseResult.courseTitle || "unknown"}`);
          results.push({ url, status: "ok", title: parseResult.courseTitle });
        }
      } catch (err) {
        console.error(`[reimport] Exception for ${url}:`, err);
        results.push({ url, status: "error", error: err instanceof Error ? err.message : String(err) });
      }
    }

    const okCount = results.filter(r => r.status === "ok").length;
    const errCount = results.filter(r => r.status === "error").length;

    return new Response(
      JSON.stringify({ success: true, total: urls.length, ok: okCount, errors: errCount, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return accessErrorResponse(err, corsHeaders);
  }
});
