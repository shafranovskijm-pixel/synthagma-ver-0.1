import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface OrganizationData {
  id: string;
  name: string;
  inn: string | null;
  kpp: string | null;
  ogrn: string | null;
  legal_address: string | null;
  actual_address: string | null;
  phone: string | null;
  email: string;
  director_name: string | null;
  director_position: string | null;
  contact_name: string | null;
}

interface StaffMember {
  fio: string;
  subject: string;
  education: string;
  experience_years: number;
  employment_type: string;
}

interface CourseData {
  id: string;
  title: string;
  description: string | null;
  duration: string | null;
}

interface EnrollmentStats {
  total: number;
  completed: number;
  inProgress: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { organizationId, orderId } = await req.json();

    if (!organizationId) {
      return new Response(JSON.stringify({ error: "Organization ID is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    if (!lovableApiKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY is not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log("Fetching organization data for:", organizationId);

    // Fetch organization data
    const { data: organization, error: orgError } = await supabase
      .from("organizations")
      .select("*")
      .eq("id", organizationId)
      .single();

    if (orgError || !organization) {
      console.error("Error fetching organization:", orgError);
      return new Response(JSON.stringify({ error: "Organization not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch order to get quiz data if available
    let quizData = null;
    if (orderId) {
      const { data: order } = await supabase
        .from("service_orders")
        .select("notes")
        .eq("id", orderId)
        .single();

      if (order?.notes) {
        try {
          quizData = JSON.parse(order.notes);
          console.log("Using quiz data from order");
        } catch (e) {
          console.log("No quiz data in order notes");
        }
      }
    }

    // Build the data object for AI generation - use quiz data if available
    const reportData = quizData ? {
      organization: {
        full_name: quizData.fullName || organization.name,
        short_name: quizData.shortName || organization.name,
        legal_form: quizData.legalForm || "Общество с ограниченной ответственностью",
        legal_address: quizData.legalAddress || organization.legal_address || "Не указан",
        phone: quizData.phone || organization.phone || "Не указан",
        email: quizData.email || organization.email,
        site: quizData.website || "Не указан",
        ogrn: quizData.ogrn || organization.ogrn || "Не указан",
        inn: quizData.inn || organization.inn || "Не указан",
        kpp: quizData.kpp || organization.kpp || "Не указан",
        license: {
          number: quizData.licenseNumber || "Не указан",
          date: quizData.licenseDate || "Не указана",
          program_types: quizData.programTypes || ["дополнительное профессиональное образование"],
        },
        founders: quizData.founders ? quizData.founders.split(",").map((f: string) => f.trim()) : [],
      },
      self_inspection: {
        period_start: quizData.periodStart ? new Date(quizData.periodStart).toLocaleDateString("ru-RU") : new Date().toLocaleDateString("ru-RU"),
        period_end: quizData.periodEnd ? new Date(quizData.periodEnd).toLocaleDateString("ru-RU") : new Date().toLocaleDateString("ru-RU"),
        order_number: quizData.orderNumber || `${new Date().getFullYear()}-СО-01`,
        order_date: quizData.orderDate ? new Date(quizData.orderDate).toLocaleDateString("ru-RU") : new Date().toLocaleDateString("ru-RU"),
        commission: {
          chairman: quizData.commissionChairman || { fio: "Не указан", position: "Директор" },
          members: quizData.commissionMembers || [],
        },
      },
      management: {
        director: { 
          fio: quizData.directorFio || organization.director_name || "Не указан", 
          term_years: quizData.directorTermYears || 3 
        },
        pedagogical_council: {
          exists: quizData.hasPedagogicalCouncil !== false,
          protocol_number: quizData.pedagogicalCouncilProtocolNumber || "1",
          protocol_date: quizData.pedagogicalCouncilProtocolDate ? new Date(quizData.pedagogicalCouncilProtocolDate).toLocaleDateString("ru-RU") : new Date().toLocaleDateString("ru-RU"),
        },
      },
      education: {
        program_types: quizData.programTypes || ["повышение квалификации"],
        programs: quizData.programs?.filter((p: any) => p.name) || [],
        total_students: quizData.totalStudents || 0,
        completed_students: quizData.completedStudents || 0,
      },
      quality: {
        control_types: quizData.controlTypes || ["входной", "текущий", "промежуточный", "итоговый"],
        testing_platform: {
          name: quizData.testingPlatformName || "Собственная образовательная платформа",
          url: quizData.testingPlatformUrl || "",
        },
        final_attestation_form: quizData.finalAttestationForm || "квалификационный экзамен",
        employer_participation: quizData.hasEmployerParticipation !== false,
      },
      staff: quizData.staff?.filter((s: any) => s.fio) || [],
      infrastructure: {
        website: quizData.hasWebsite !== false,
        distance_platform: quizData.hasDistancePlatform !== false,
        multimedia: quizData.hasMultimedia !== false,
        library: quizData.hasLibrary !== false,
        additional_equipment: quizData.additionalEquipment || "",
      },
      conclusion: {
        period_text: `с ${quizData.periodStart ? new Date(quizData.periodStart).toLocaleDateString("ru-RU") : ""} по ${quizData.periodEnd ? new Date(quizData.periodEnd).toLocaleDateString("ru-RU") : ""}`,
        conclusion_variant: "положительное",
      },
      additional_notes: quizData.additionalNotes || "",
    } : {
      // Fallback to database data if no quiz data
      organization: {
        full_name: organization.name,
        short_name: organization.name,
        legal_form: "Общество с ограниченной ответственностью",
        legal_address: organization.legal_address || "Не указан",
        phone: organization.phone || "Не указан",
        email: organization.email,
        site: "Не указан",
        ogrn: organization.ogrn || "Не указан",
        inn: organization.inn || "Не указан",
        kpp: organization.kpp || "Не указан",
        license: { number: "Не указан", date: "Не указана", program_types: ["ДПО"] },
        founders: [organization.director_name || "Не указан"],
      },
      self_inspection: {
        period_start: new Date(new Date().getFullYear(), 0, 1).toLocaleDateString("ru-RU"),
        period_end: new Date().toLocaleDateString("ru-RU"),
        order_number: `${new Date().getFullYear()}-СО-01`,
        order_date: new Date().toLocaleDateString("ru-RU"),
        commission: { chairman: { fio: organization.director_name || "Не указан", position: "Директор" }, members: [] },
      },
      management: {
        director: { fio: organization.director_name || "Не указан", term_years: 3 },
        pedagogical_council: { exists: true, protocol_number: "1", protocol_date: new Date().toLocaleDateString("ru-RU") },
      },
      education: { program_types: ["ДПО"], programs: [], total_students: 0, completed_students: 0 },
      quality: { control_types: ["входной", "текущий", "промежуточный", "итоговый"], testing_platform: { name: "", url: "" }, final_attestation_form: "квалификационный экзамен", employer_participation: true },
      staff: [],
      infrastructure: { website: true, distance_platform: true, multimedia: true, library: true },
      conclusion: { period_text: "", conclusion_variant: "положительное" },
    };

    console.log("Generating report with AI...");

    const systemPrompt = `Ты — эксперт по образовательному законодательству РФ и специалист по подготовке отчётов о результатах самообследования образовательных организаций.

Ты строго соблюдаешь:
- Федеральный закон №273-ФЗ «Об образовании в РФ»
- Приказ Минобрнауки РФ №462 от 14.06.2013
- Лицензионные требования к образовательной деятельности
- Деловой, нормативно-правовой стиль

На основе переданных данных сформируй полный отчет о результатах самообследования образовательной организации, реализующей:
- дополнительное профессиональное образование (повышение квалификации, профессиональная переподготовка)
- и/или профессиональное обучение

Отчет должен:
- соответствовать требованиям законодательства РФ
- быть готовым к размещению на официальном сайте
- подходить для проверок лицензирующих органов
- не содержать противоречий и «пустых» формулировок

СТРУКТУРА ОТЧЁТА:
1. Титульная часть (наименование отчета, организации)
2. Пояснительная записка (основание, цели, период, состав комиссии)
3. Раздел 1. Общие сведения об образовательной организации
4. Раздел 2. Организационно-правовое обеспечение образовательной деятельности
5. Раздел 3. Система управления организацией
6. Раздел 4. Организация образовательного процесса (структура, содержание, качество)
7. Раздел 5. Условия реализации образовательных программ (кадры, информационно-методическое, материально-техническое)
8. Раздел 6. Выводы

ПРАВИЛА:
- Используй официально-деловой, нормативный стиль
- Пиши утвердительными формулировками
- Если данные отсутствуют — корректно обобщай, но не выдумывай факты
- Формулировки должны быть типовыми для отчетов о самообследовании
- Если pedagogical_council.exists = false, не упоминай педагогический совет
- Таблицы формируй в HTML формате

Верни ТОЛЬКО HTML-код отчета без каких-либо пояснений или комментариев. Документ должен быть готов к сохранению в PDF.`;

    const userPrompt = `Сформируй отчёт о результатах самообследования на основе следующих данных:

${JSON.stringify(reportData, null, 2)}`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 8000,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI API error:", aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required. Please add credits." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      return new Response(JSON.stringify({ error: "AI generation failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    let reportContent = aiData.choices?.[0]?.message?.content || "";

    // Clean up the response - remove markdown code blocks if present
    reportContent = reportContent.replace(/```html\n?/g, "").replace(/```\n?/g, "").trim();

    // Wrap in proper HTML document structure
    const fullHtmlDocument = `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Отчёт о результатах самообследования - ${organization.name}</title>
    <style>
        body {
            font-family: 'Times New Roman', serif;
            font-size: 14pt;
            line-height: 1.5;
            margin: 40px;
            color: #000;
        }
        h1, h2, h3 {
            text-align: center;
            margin-top: 24px;
            margin-bottom: 16px;
        }
        h1 { font-size: 18pt; }
        h2 { font-size: 16pt; }
        h3 { font-size: 14pt; }
        p { text-indent: 1.25cm; text-align: justify; margin: 8px 0; }
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 16px 0;
        }
        th, td {
            border: 1px solid #000;
            padding: 8px;
            text-align: left;
        }
        th { background-color: #f0f0f0; }
        ul, ol { margin-left: 40px; }
        .title-page { text-align: center; margin-bottom: 48px; }
        .section { margin-top: 24px; }
        @media print {
            body { margin: 20mm; }
            .page-break { page-break-before: always; }
        }
    </style>
</head>
<body>
${reportContent}
</body>
</html>`;

    console.log("Uploading report to storage...");

    // Upload the report to Supabase storage
    const fileName = `${organizationId}/self-examination-report-${new Date().getFullYear()}-${Date.now()}.html`;
    const blob = new Blob([fullHtmlDocument], { type: "text/html" });

    const { error: uploadError } = await supabase.storage
      .from("org-documents")
      .upload(fileName, blob, {
        contentType: "text/html",
        upsert: true,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return new Response(JSON.stringify({ error: "Failed to save report" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: urlData } = supabase.storage
      .from("org-documents")
      .getPublicUrl(fileName);

    const fileUrl = urlData.publicUrl;

    console.log("Saving document record...");

    // Check if document already exists
    const { data: existingDoc } = await supabase
      .from("org_documents")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("type", "self_examination_report")
      .single();

    if (existingDoc) {
      // Update existing document
      const { error: updateError } = await supabase
        .from("org_documents")
        .update({
          name: `Отчёт о результатах самообследования ${new Date().getFullYear()}`,
          file_url: fileUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingDoc.id);

      if (updateError) {
        console.error("Update error:", updateError);
      }
    } else {
      // Create new document record
      const { error: insertError } = await supabase
        .from("org_documents")
        .insert({
          organization_id: organizationId,
          type: "self_examination_report",
          name: `Отчёт о результатах самообследования ${new Date().getFullYear()}`,
          file_url: fileUrl,
        });

      if (insertError) {
        console.error("Insert error:", insertError);
      }
    }

    // Update order status if orderId provided
    if (orderId) {
      const { error: orderError } = await supabase
        .from("service_orders")
        .update({
          status: "completed",
          updated_at: new Date().toISOString(),
          notes: `Отчёт сгенерирован: ${fileUrl}`,
        })
        .eq("id", orderId);

      if (orderError) {
        console.error("Order update error:", orderError);
      }
    }

    console.log("Report generated successfully!");

    return new Response(
      JSON.stringify({
        success: true,
        fileUrl,
        message: "Отчёт о результатах самообследования успешно сгенерирован",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error generating report:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
