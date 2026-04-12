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
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();

    // === RECURSIVE PROCESSING MODE ===
    if (body.processBatchId) {
      const batchId = body.processBatchId;
      console.log(`[batch] Processing next pending job for batch ${batchId}`);

      // Pick next pending job
      const { data: pendingJobs } = await supabase
        .from("skillspace_import_jobs")
        .select("id, url, batch_id, organization_id")
        .eq("batch_id", batchId)
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(1);

      if (!pendingJobs || pendingJobs.length === 0) {
        console.log(`[batch] No more pending jobs for batch ${batchId}`);
        return new Response(
          JSON.stringify({ done: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const job = pendingJobs[0];

      try {
        await supabase
          .from("skillspace_import_jobs")
          .update({ status: "processing" })
          .eq("id", job.id);

        // Get and decrypt credentials
        const { data: jobData } = await supabase
          .from("skillspace_import_jobs")
          .select("login, password")
          .eq("id", job.id)
          .single();

        const { data: decryptedLogin } = await supabase.rpc("decrypt_password", {
          p_text: jobData?.login || "",
        });
        const { data: decryptedPassword } = await supabase.rpc("decrypt_password", {
          p_text: jobData?.password || "",
        });

        // Call parse function
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
              login: decryptedLogin,
              password: decryptedPassword,
              organizationId: job.organization_id,
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
            .update({ status: "done", result: parseResult })
            .eq("id", job.id);
        }
      } catch (err) {
        console.error(`[batch] Job ${job.id} error:`, err);
        await supabase
          .from("skillspace_import_jobs")
          .update({
            status: "error",
            error_message: err instanceof Error ? err.message : String(err),
          })
          .eq("id", job.id);
      }

      // Fire-and-forget: trigger next job
      try {
        fetch(`${supabaseUrl}/functions/v1/batch-skillspace-import`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${anonKey}`,
            apikey: anonKey,
          },
          body: JSON.stringify({ processBatchId: batchId }),
        }).catch(() => {});
      } catch (_) {}

      return new Response(
        JSON.stringify({ processing: true, jobId: job.id }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // === INITIAL BATCH CREATION MODE ===
    // Validate auth via user token
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
    const { data: userData, error: userError } = await supabaseAuth.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    const batchId = crypto.randomUUID();

    // Create job records
    const jobs = urls.map((url: string) => ({
      organization_id: organizationId,
      batch_id: batchId,
      url: url.trim(),
      login,
      password,
      status: "pending",
      created_by: userData.user.id,
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

    // Fire-and-forget: start processing first job
    try {
      fetch(`${supabaseUrl}/functions/v1/batch-skillspace-import`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${anonKey}`,
          apikey: anonKey,
        },
        body: JSON.stringify({ processBatchId: batchId }),
      }).catch(() => {});
    } catch (_) {}

    return new Response(
      JSON.stringify({ success: true, batchId, jobCount: insertedJobs!.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Batch import error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
