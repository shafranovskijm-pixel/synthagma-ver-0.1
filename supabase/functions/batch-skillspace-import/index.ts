import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Validate auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(
      authHeader.replace("Bearer ", "")
    );
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { urls, login, password, organizationId } = body;

    if (!Array.isArray(urls) || urls.length === 0 || !login || !password || !organizationId) {
      return new Response(
        JSON.stringify({ error: "urls, login, password, organizationId обязательны" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (urls.length > 50) {
      return new Response(
        JSON.stringify({ error: "Максимум 50 ссылок за раз" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const batchId = crypto.randomUUID();

    // Create job records
    const jobs = urls.map((url: string) => ({
      organization_id: organizationId,
      batch_id: batchId,
      url: url.trim(),
      login,
      password,
      status: "pending",
      created_by: claimsData.claims.sub,
    }));

    const { data: insertedJobs, error: insertError } = await supabase
      .from("skillspace_import_jobs")
      .insert(jobs)
      .select("id, url");

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(
        JSON.stringify({ error: "Не удалось создать задачи: " + insertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Return immediately with batch_id — processing happens async below
    const response = new Response(
      JSON.stringify({ success: true, batchId, jobCount: insertedJobs.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

    // Process jobs sequentially in the background (after response is sent)
    // EdgeRuntime keeps the function alive for background work
    (async () => {
      for (const job of insertedJobs) {
        try {
          // Mark as processing
          await supabase
            .from("skillspace_import_jobs")
            .update({ status: "processing" })
            .eq("id", job.id);

          // Get decrypted credentials from the job
          const { data: jobData } = await supabase
            .from("skillspace_import_jobs")
            .select("login, password")
            .eq("id", job.id)
            .single();

          // Decrypt credentials
          const { data: decryptedLogin } = await supabase.rpc("decrypt_password", {
            p_text: jobData?.login || "",
          });
          const { data: decryptedPassword } = await supabase.rpc("decrypt_password", {
            p_text: jobData?.password || "",
          });

          // Call existing parse function
          const parseResponse = await fetch(
            `${supabaseUrl}/functions/v1/parse-skillspace-course`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${anonKey}`,
                apikey: anonKey,
              },
              body: JSON.stringify({
                url: job.url,
                login: decryptedLogin || login,
                password: decryptedPassword || password,
                organizationId,
              }),
            }
          );

          const parseResult = await parseResponse.json();

          if (!parseResponse.ok || parseResult.error) {
            await supabase
              .from("skillspace_import_jobs")
              .update({
                status: "error",
                error_message: parseResult.error || `HTTP ${parseResponse.status}`,
              })
              .eq("id", job.id);
          } else {
            await supabase
              .from("skillspace_import_jobs")
              .update({
                status: "done",
                result: parseResult,
              })
              .eq("id", job.id);
          }
        } catch (err) {
          console.error(`Job ${job.id} error:`, err);
          await supabase
            .from("skillspace_import_jobs")
            .update({
              status: "error",
              error_message: err instanceof Error ? err.message : String(err),
            })
            .eq("id", job.id);
        }
      }
    })();

    return response;
  } catch (err) {
    console.error("Batch import error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
