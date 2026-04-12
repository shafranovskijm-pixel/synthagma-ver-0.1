import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Kinescope DRM Authorization Backend
 * 
 * Kinescope calls this endpoint when a user tries to play a DRM-protected video.
 * The player sends a `drmauthtoken` query parameter containing a base64-encoded JSON
 * with { userId, courseId }.
 * 
 * This function checks if the user is enrolled in the course.
 * Returns 200 = allow playback, 403 = deny.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    
    // Kinescope sends the token as a query parameter
    const token = url.searchParams.get("drmauthtoken");

    if (!token) {
      console.error("DRM auth: no token provided");
      return new Response("Forbidden", { status: 403, headers: corsHeaders });
    }

    // Decode token: base64 JSON { userId, courseId, exp }
    let payload: { userId: string; courseId: string; exp: number };
    try {
      const decoded = atob(token);
      payload = JSON.parse(decoded);
    } catch {
      console.error("DRM auth: invalid token format");
      return new Response("Forbidden", { status: 403, headers: corsHeaders });
    }

    const { userId, courseId, exp } = payload;

    if (!userId || !courseId) {
      console.error("DRM auth: missing userId or courseId");
      return new Response("Forbidden", { status: 403, headers: corsHeaders });
    }

    // Check expiration (token valid for 4 hours)
    if (exp && Date.now() > exp) {
      console.error("DRM auth: token expired");
      return new Response("Forbidden", { status: 403, headers: corsHeaders });
    }

    // Use service role to check enrollment
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Check if user is enrolled in the course
    const { data: enrollment, error } = await supabase
      .from("enrollments")
      .select("id, status")
      .eq("user_id", userId)
      .eq("course_id", courseId)
      .in("status", ["active", "completed"])
      .maybeSingle();

    if (error) {
      console.error("DRM auth: DB error", error.message);
      return new Response("Forbidden", { status: 403, headers: corsHeaders });
    }

    if (!enrollment) {
      // Also check if user is org admin or platform admin
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .single();

      const role = roleData?.role;
      if (role === "admin") {
        // Platform admins can always view
        return new Response("OK", { status: 200, headers: corsHeaders });
      }

      if (role === "organization") {
        // Check if org owns this course
        const { data: profile } = await supabase
          .from("profiles")
          .select("organization_id")
          .eq("user_id", userId)
          .single();

        if (profile?.organization_id) {
          const { data: course } = await supabase
            .from("courses")
            .select("id")
            .eq("id", courseId)
            .eq("organization_id", profile.organization_id)
            .maybeSingle();

          if (course) {
            return new Response("OK", { status: 200, headers: corsHeaders });
          }
        }
      }

      console.error("DRM auth: no enrollment found for user", userId, "course", courseId);
      return new Response("Forbidden", { status: 403, headers: corsHeaders });
    }

    // User is enrolled — allow playback
    return new Response("OK", { status: 200, headers: corsHeaders });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("DRM auth error:", message);
    return new Response("Forbidden", { status: 403, headers: corsHeaders });
  }
});
