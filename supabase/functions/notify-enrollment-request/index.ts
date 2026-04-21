import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { course_id, student_name: providedName } = await req.json();
    if (!course_id) {
      return new Response(JSON.stringify({ error: "course_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid authentication" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: course, error: courseError } = await supabaseAdmin
      .from("courses")
      .select("id, title, price, organization_id")
      .eq("id", course_id)
      .single();

    if (courseError || !course) {
      return new Response(JSON.stringify({ error: "Course not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("full_name, email")
      .eq("user_id", user.id)
      .maybeSingle();

    // Use provided name from CTA form, then profile name, then email, then fallback
    const studentName = providedName || profile?.full_name || profile?.email || user.email || "Ученик";
    const formattedPrice = Number(course.price || 0).toLocaleString("ru-RU");
    const chatContent = course.price > 0
      ? `📋 Заявка на запись: ${studentName} хочет записаться на курс «${course.title}» (${formattedPrice} ₽)`
      : `📋 Заявка на запись: ${studentName} хочет записаться на курс «${course.title}»`;

    const [chatResult, notificationResult, orgRes] = await Promise.all([
      supabaseAdmin.from("org_general_messages").insert({
        organization_id: course.organization_id,
        sender_user_id: user.id,
        content: chatContent,
      }),
      supabaseAdmin.from("org_notifications").insert({
        organization_id: course.organization_id,
        user_id: user.id,
        type: "enrollment_request",
        title: "Новая заявка на запись",
        message: `${studentName} хочет записаться на курс «${course.title}»`,
        related_id: course.id,
        is_read: false,
      }),
      supabaseAdmin
        .from("organizations")
        .select("telegram_notify_enabled, telegram_notify_chat_id")
        .eq("id", course.organization_id)
        .maybeSingle(),
    ]);

    // Telegram-уведомление организации (best-effort)
    const tgEnabled = (orgRes.data as any)?.telegram_notify_enabled === true;
    const tgChatId = (orgRes.data as any)?.telegram_notify_chat_id;
    if (tgEnabled && tgChatId) {
      try {
        const message = `📋 <b>Новая заявка на запись</b>\n\n` +
          `<b>Курс:</b> ${course.title}\n` +
          `<b>Ученик:</b> ${studentName}\n` +
          (course.price > 0 ? `<b>Цена:</b> ${formattedPrice} ₽\n` : `<b>Цена:</b> Бесплатно\n`) +
          `<b>Email:</b> ${profile?.email || user.email || "—"}`;
        await supabaseAdmin.functions.invoke("send-telegram-notification", {
          body: { chat_id: tgChatId, message },
        });
      } catch (e) {
        console.warn("telegram notify err:", e);
      }
    }

    if (chatResult.error) {
      console.error("Failed to create org chat message:", chatResult.error);
      throw chatResult.error;
    }

    if (notificationResult.error) {
      console.error("Failed to create org notification:", notificationResult.error);
      throw notificationResult.error;
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("notify-enrollment-request error:", error);
    return new Response(JSON.stringify({ error: error?.message || "Unexpected error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
