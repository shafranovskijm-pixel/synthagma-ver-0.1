import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Kinescope Video Migration
 * 
 * Finds all video lessons with external URLs and imports them into Kinescope
 * using Kinescope's "import by URL" API — Kinescope downloads the file itself.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const KINESCOPE_API = "https://api.kinescope.io/v1";

const isExternalVideoUrl = (content: string): boolean => {
  if (!content) return false;
  if (content.startsWith("kinescope:")) return false;
  if (content.includes("kinescope.io")) return false;
  // Explicitly exclude ktalk.ru and vkvideo.ru — leave as-is
  if (content.includes("ktalk.ru")) return false;
  if (content.includes("vkvideo.ru")) return false;
  if (content.includes("vk.com/video")) return false;
  // Direct video file or CDN
  if (/\.(mp4|webm|ogg|mov|mkv|m4v)(\?.*)?$/i.test(content)) return true;
  if (content.includes("selcdn.ru")) return true;
  if (content.includes("selstorage.ru")) return true;
  // Supabase Storage public URLs
  if (content.includes("supabase.co/storage")) return true;
  return false;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const kinescopeToken = Deno.env.get("KINESCOPE_API_TOKEN");
    if (!kinescopeToken) {
      return new Response(JSON.stringify({ error: "KINESCOPE_API_TOKEN not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Verify caller is org admin or platform admin
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const jwt = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (!roleData || !["admin", "organization"].includes(roleData.role)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { course_id, organization_id, parent_id } = await req.json();

    // Get Kinescope project ID — use provided or fetch first available
    let projectId = parent_id;
    if (!projectId) {
      const projRes = await fetch(`${KINESCOPE_API}/projects`, {
        headers: { Authorization: `Bearer ${kinescopeToken}` },
      });
      const projData = await projRes.json();
      projectId = projData?.data?.[0]?.id;
      if (!projectId) {
        return new Response(JSON.stringify({ error: "No Kinescope project found. Create a project in Kinescope first." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Build query for lessons
    let query = supabase
      .from("lessons")
      .select("id, title, content, course_id, courses!inner(id, title, organization_id)")
      .eq("type", "video");

    if (course_id) {
      query = query.eq("course_id", course_id);
    } else if (organization_id) {
      query = query.eq("courses.organization_id", organization_id);
    } else {
      // For org users, scope to their org
      if (roleData.role === "organization") {
        const { data: profile } = await supabase
          .from("profiles")
          .select("organization_id")
          .eq("user_id", user.id)
          .single();
        if (profile?.organization_id) {
          query = query.eq("courses.organization_id", profile.organization_id);
        }
      }
    }

    const { data: lessons, error: lessonsError } = await query;
    if (lessonsError) {
      return new Response(JSON.stringify({ error: lessonsError.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Filter to only external video URLs
    const externalLessons = (lessons || []).filter(l => isExternalVideoUrl(l.content || ""));

    if (externalLessons.length === 0) {
      return new Response(JSON.stringify({
        migrated: 0, failed: 0, total: 0,
        message: "Нет внешних видео для миграции",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: { lesson_id: string; title: string; status: string; video_id?: string; error?: string }[] = [];

    for (const lesson of externalLessons) {
      const videoUrl = lesson.content!;
      const lessonTitle = lesson.title || "Untitled";

      try {
        // Import video by URL via Kinescope Uploader API v2
        const importRes = await fetch("https://uploader.kinescope.io/v2/video", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${kinescopeToken}`,
            "X-Parent-ID": projectId,
            "X-Video-Title": lessonTitle,
            "X-Video-URL": videoUrl,
          },
        });

        if (!importRes.ok) {
          const errText = await importRes.text();
          results.push({ lesson_id: lesson.id, title: lessonTitle, status: "failed", error: errText });
          continue;
        }

        const importData = await importRes.json();
        const videoId = importData?.data?.id;

        if (!videoId) {
          results.push({ lesson_id: lesson.id, title: lessonTitle, status: "failed", error: "No video ID returned" });
          continue;
        }

        // Update lesson content to kinescope reference
        const { error: updateError } = await supabase
          .from("lessons")
          .update({ content: `kinescope:${videoId}` })
          .eq("id", lesson.id);

        if (updateError) {
          results.push({ lesson_id: lesson.id, title: lessonTitle, status: "failed", error: updateError.message, video_id: videoId });
        } else {
          results.push({ lesson_id: lesson.id, title: lessonTitle, status: "migrated", video_id: videoId });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        results.push({ lesson_id: lesson.id, title: lessonTitle, status: "failed", error: msg });
      }
    }

    const migrated = results.filter(r => r.status === "migrated").length;
    const failed = results.filter(r => r.status === "failed").length;

    return new Response(JSON.stringify({
      migrated,
      failed,
      total: externalLessons.length,
      results,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("kinescope-migrate error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
