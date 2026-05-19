// Validates a student auto-login token and returns a Supabase magic-link action_url.
// Public endpoint (no JWT) — the bearer of the token represents the student.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { token, redirectTo } = await req.json();
    if (!token || typeof token !== "string") {
      return new Response(JSON.stringify({ error: "Missing token" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: rec, error } = await sb
      .from("student_login_tokens")
      .select("id, user_id, organization_id, revoked_at")
      .eq("token", token)
      .maybeSingle();

    if (error || !rec || rec.revoked_at) {
      return new Response(JSON.stringify({ error: "Token invalid or revoked" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve email from auth.users via admin API
    const { data: userResp, error: uErr } = await sb.auth.admin.getUserById(rec.user_id);
    if (uErr || !userResp?.user?.email) {
      return new Response(JSON.stringify({ error: "Student email not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const safeRedirect = (() => {
      const allowed = [
        /^https:\/\/(www\.)?sintagma\.com\.ru/,
        /^https:\/\/xn--80aaiswd0ak\.xn--p1ai/,
        /^https:\/\/синтагма\.рф/,
        /^https:\/\/[a-z0-9-]+\.lovable\.app/,
        /^https:\/\/[a-z0-9-]+\.lovable\.dev/,
        /^http:\/\/localhost/,
      ];
      if (redirectTo && allowed.some(r => r.test(redirectTo))) return redirectTo;
      return "https://sintagma.com.ru/student";
    })();

    const { data: linkData, error: linkErr } = await sb.auth.admin.generateLink({
      type: "magiclink",
      email: userResp.user.email,
      options: { redirectTo: safeRedirect },
    });

    if (linkErr || !linkData?.properties?.action_link) {
      console.error("generateLink error:", linkErr);
      return new Response(JSON.stringify({ error: "Failed to generate sign-in link" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Bump last_used_at (non-fatal).
    await sb.from("student_login_tokens")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", rec.id);

    return new Response(JSON.stringify({ action_url: linkData.properties.action_link }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("student-auto-login error:", e);
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
