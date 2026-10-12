import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { generatePdfHtml, prepareCompanyCardData } from "./company-card.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { format, companyData } = await req.json();

    if (!format || !companyData) {
      return new Response(JSON.stringify({ error: "Missing format or companyData" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data: stored, error: settingsError } = await supabase
      .from("app_settings")
      .select("setting_value")
      .eq("setting_key", "operator_requisites")
      .maybeSingle();
    if (settingsError) {
      throw new Error("Не удалось загрузить актуальные реквизиты. Повторите скачивание карточки позже.");
    }
    const currentCompanyData = prepareCompanyCardData(companyData, stored?.setting_value);

    if (format === "pdf") {
      // Return HTML that can be printed to PDF from the browser
      const html = generatePdfHtml(currentCompanyData);
      const base64 = btoa(unescape(encodeURIComponent(html)));
      return new Response(JSON.stringify({ base64, format: "html", mimeType: "text/html" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (format === "docx") {
      // Generate a simple HTML-based docx (Word can open HTML files saved as .doc)
      const html = generatePdfHtml(currentCompanyData);
      const docHtml = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="UTF-8"><meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->
</head><body>${html}</body></html>`;
      const base64 = btoa(unescape(encodeURIComponent(docHtml)));
      return new Response(JSON.stringify({ base64, format: "docx" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid format" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-company-card error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
