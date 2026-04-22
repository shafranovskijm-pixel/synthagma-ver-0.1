import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const REMINDER_DAYS = [30, 14, 7, 1];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    // Auto-mark expired
    const { data: expiredDocs } = await supabase
      .from("org_documents")
      .select("id")
      .lt("expires_at", today.toISOString().split("T")[0])
      .eq("status", "active");

    if (expiredDocs && expiredDocs.length > 0) {
      await supabase
        .from("org_documents")
        .update({ status: "expired" })
        .in("id", expiredDocs.map((d) => d.id));
    }

    let totalReminders = 0;

    for (const days of REMINDER_DAYS) {
      const target = new Date(today);
      target.setUTCDate(target.getUTCDate() + days);
      const targetStr = target.toISOString().split("T")[0];

      const { data: docs, error } = await supabase
        .from("org_documents")
        .select("id, organization_id, name, type, expires_at, reminder_sent_at, responsible_person")
        .eq("expires_at", targetStr)
        .eq("status", "active");

      if (error) {
        console.error("query error:", error);
        continue;
      }
      if (!docs || docs.length === 0) continue;

      for (const doc of docs) {
        // Skip if already reminded today
        if (doc.reminder_sent_at) {
          const lastSent = new Date(doc.reminder_sent_at);
          lastSent.setUTCHours(0, 0, 0, 0);
          if (lastSent.getTime() === today.getTime()) continue;
        }

        // Найти получателей в org_staff/profiles
        const { data: staff } = await supabase
          .from("org_staff")
          .select("user_id")
          .eq("organization_id", doc.organization_id);

        const recipients = (staff || []).map((s) => s.user_id);

        // Также добавим owner (profiles.user_id с organization_id)
        const { data: owner } = await supabase
          .from("profiles")
          .select("user_id")
          .eq("organization_id", doc.organization_id)
          .limit(1)
          .maybeSingle();
        if (owner?.user_id && !recipients.includes(owner.user_id)) {
          recipients.push(owner.user_id);
        }

        for (const userId of recipients) {
          await supabase.from("org_notifications").insert({
            organization_id: doc.organization_id,
            user_id: userId,
            type: "document_expiry",
            title: `Документ истекает через ${days} дн.`,
            message: `«${doc.name}» истекает ${doc.expires_at}. ${doc.responsible_person ? `Ответственный: ${doc.responsible_person}` : ""}`.trim(),
            related_id: doc.id,
          });
        }

        await supabase
          .from("org_documents")
          .update({ reminder_sent_at: new Date().toISOString() })
          .eq("id", doc.id);

        totalReminders += recipients.length;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        expired_marked: expiredDocs?.length || 0,
        reminders_sent: totalReminders,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
