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
        // Create video entry via Kinescope API
        const createRes = await fetch(`${KINESCOPE_API}/videos`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            parent_id: parent_id || undefined,
            title: title || "Untitled",
            type: "vod",
          }),
        });

        if (!createRes.ok) {
          const errBody = await createRes.text();
          return new Response(JSON.stringify({ error: `Kinescope create failed: ${errBody}` }), {
            status: createRes.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const createData = await createRes.json();
        const videoId = createData.data?.id;

        if (!videoId) {
          return new Response(JSON.stringify({ error: "No video ID returned from Kinescope" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Init TUS upload
        const tusRes = await fetch(`${KINESCOPE_UPLOADER}/video/${videoId}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Upload-Length": String(file_size),
            "Tus-Resumable": "1.0.0",
          },
        });

        if (!tusRes.ok) {
          const errBody = await tusRes.text();
          return new Response(JSON.stringify({ error: `TUS init failed: ${errBody}` }), {
            status: tusRes.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const uploadUrl = tusRes.headers.get("Location");
        const embedUrl = `https://kinescope.io/embed/${videoId}`;

        return new Response(JSON.stringify({
          video_id: videoId,
          upload_url: uploadUrl,
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
