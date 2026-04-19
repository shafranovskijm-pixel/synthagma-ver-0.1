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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return respond(false, { error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user?.id) {
      return respond(false, { error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
    }

    const oauthToken = Deno.env.get("YANDEX_TELEMOST_OAUTH_TOKEN");
    if (!oauthToken) {
      return respond(false, {
        error:
          "Yandex Telemost OAuth token не настроен. Добавьте секрет YANDEX_TELEMOST_OAUTH_TOKEN.",
        code: "TOKEN_NOT_CONFIGURED",
      }, 500);
    }

    const body: CreateBody = await req.json().catch(() => ({}));
    const title = (body.title || "").toString().trim().slice(0, 200) || "Вебинар";
    const description = (body.description || "").toString().trim().slice(0, 1000);
    const withLiveStream = body.withLiveStream !== false;

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

      if (yaResp.status === 403 && yaData?.error === "ApiRestrictedToOrganizations") {
        return respond(false, {
          error:
            "Яндекс Телемост API доступен только для аккаунтов Яндекс 360 для бизнеса. Проверьте, что OAuth-токен выпущен для такого аккаунта.",
          code: "YANDEX_360_REQUIRED",
          status: yaResp.status,
          details: yaData,
        });
      }

      return respond(false, {
        error: message,
        code: "YANDEX_API_ERROR",
        status: yaResp.status,
        details: yaData,
      });
    }

    const id = yaData?.id || yaData?.conference_id || null;
    const join_url = yaData?.join_url || yaData?.url || null;
    const watch_url = yaData?.live_stream?.watch_url || null;
    const sip_id = yaData?.sip?.id || yaData?.sip_id || null;

    return respond(true, {
      id,
      join_url,
      watch_url,
      sip_id,
      raw: yaData,
    });
  } catch (e) {
    console.error("[telemost] unexpected", e);
    return respond(false, {
      error: (e as Error).message || "Internal error",
      code: "INTERNAL_ERROR",
    }, 500);
  }
});

function respond(ok: boolean, data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify({ ok, ...data }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}
