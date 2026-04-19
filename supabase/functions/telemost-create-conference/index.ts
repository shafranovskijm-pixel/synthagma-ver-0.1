import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface CreateBody {
  title?: string;
  description?: string;
  withLiveStream?: boolean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user?.id) {
      return json({ error: "Unauthorized" }, 401);
    }

    const oauthToken = Deno.env.get("YANDEX_TELEMOST_OAUTH_TOKEN");
    if (!oauthToken) {
      return json(
        {
          error:
            "Yandex Telemost OAuth token не настроен. Добавьте секрет YANDEX_TELEMOST_OAUTH_TOKEN.",
        },
        500,
      );
    }

    const body: CreateBody = await req.json().catch(() => ({}));
    const title = (body.title || "").toString().trim().slice(0, 200) || "Вебинар";
    const description = (body.description || "").toString().trim().slice(0, 1000);
    const withLiveStream = body.withLiveStream !== false; // default true

    const payload: Record<string, unknown> = {
      access_level: "PUBLIC",
    };
    if (withLiveStream) {
      payload.live_stream = {
        access_level: "PUBLIC",
        title,
        description: description || undefined,
      };
    }

    const yaResp = await fetch(
      "https://cloud-api.yandex.net/v1/telemost-api/conferences",
      {
        method: "POST",
        headers: {
          "Authorization": `OAuth ${oauthToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );

    const yaText = await yaResp.text();
    let yaData: any = null;
    try {
      yaData = JSON.parse(yaText);
    } catch {
      yaData = { raw: yaText };
    }

    if (!yaResp.ok) {
      console.error("[telemost] Yandex API error", yaResp.status, yaText);
      const message =
        yaData?.message ||
        yaData?.error_description ||
        yaData?.description ||
        `Яндекс Телемост вернул ошибку ${yaResp.status}`;
      return json({ error: message, status: yaResp.status, details: yaData }, 502);
    }

    const id = yaData?.id || yaData?.conference_id || null;
    const join_url = yaData?.join_url || yaData?.url || null;
    const watch_url = yaData?.live_stream?.watch_url || null;
    const sip_id = yaData?.sip?.id || yaData?.sip_id || null;

    return json({
      ok: true,
      id,
      join_url,
      watch_url,
      sip_id,
      raw: yaData,
    });
  } catch (e) {
    console.error("[telemost] unexpected", e);
    return json({ error: (e as Error).message || "Internal error" }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}
