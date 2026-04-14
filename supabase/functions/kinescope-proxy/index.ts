import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const KINESCOPE_API = "https://api.kinescope.io/v1";
const KINESCOPE_UPLOADER = "https://uploader.kinescope.io/v2";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const token = Deno.env.get("KINESCOPE_API_TOKEN");
    if (!token) {
      return new Response(JSON.stringify({ error: "KINESCOPE_API_TOKEN not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, ...params } = await req.json();

    switch (action) {
      case "list_projects": {
        const res = await fetch(`${KINESCOPE_API}/projects`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "upload_init": {
        const { parent_id, title, file_size } = params;

        // Use Kinescope Uploader API v2 to initialize upload
        const initRes = await fetch(`${KINESCOPE_UPLOADER}/init`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            type: "video",
            parent_id: parent_id || undefined,
            title: title || "Untitled",
            filesize: file_size,
          }),
        });

        if (!initRes.ok) {
          const errBody = await initRes.text();
          console.error("Kinescope Uploader /v2/init failed:", {
            status: initRes.status,
            body: errBody,
          });
          return new Response(JSON.stringify({
            error: "Kinescope Uploader API error",
            status: initRes.status,
            raw_response: errBody,
            request_info: {
              method: "POST",
              url: `${KINESCOPE_UPLOADER}/init`,
              body: {
                type: "video",
                parent_id: parent_id || undefined,
                title: title || "Untitled",
                filesize: file_size,
              },
            },
          }), {
            status: initRes.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const initData = await initRes.json();
        const videoId = initData.data?.id;
        const uploadEndpoint = initData.data?.endpoint;

        if (!videoId || !uploadEndpoint) {
          return new Response(JSON.stringify({
            error: "No video ID or upload endpoint returned from Kinescope",
            raw_response: JSON.stringify(initData),
          }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const embedUrl = `https://kinescope.io/embed/${videoId}`;

        return new Response(JSON.stringify({
          video_id: videoId,
          upload_url: uploadEndpoint,
          embed_url: embedUrl,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "get_video": {
        const { video_id } = params;
        const res = await fetch(`${KINESCOPE_API}/videos/${video_id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "list_videos": {
        const { project_id, page, per_page } = params;
        const qs = new URLSearchParams();
        if (project_id) qs.set("parent_id", project_id);
        if (page) qs.set("page", String(page));
        qs.set("per_page", String(per_page || 20));
        qs.set("order", "created_at.desc");

        const res = await fetch(`${KINESCOPE_API}/videos?${qs}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "delete_video": {
        const { video_id } = params;
        const res = await fetch(`${KINESCOPE_API}/videos/${video_id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const errBody = await res.text();
          return new Response(JSON.stringify({ error: errBody }), {
            status: res.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ── Kinescope Live API ──

      case "create_live": {
        const { title: liveTitle, project_id } = params;
        const body: Record<string, unknown> = {
          title: liveTitle || "Live Stream",
          type: "livestream",
        };
        if (project_id) body.parent_id = project_id;

        const res = await fetch(`${KINESCOPE_API}/live/streams`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) {
          return new Response(JSON.stringify({ error: data }), {
            status: res.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "stop_live": {
        const { live_id } = params;
        const res = await fetch(`${KINESCOPE_API}/live/streams/${live_id}/stop`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        return new Response(JSON.stringify(data), {
          status: res.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "get_live": {
        const { live_id } = params;
        const res = await fetch(`${KINESCOPE_API}/live/streams/${live_id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "list_live": {
        const qs = new URLSearchParams();
        if (params.page) qs.set("page", String(params.page));
        qs.set("per_page", String(params.per_page || 50));

        const res = await fetch(`${KINESCOPE_API}/live/streams?${qs}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("kinescope-proxy error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
