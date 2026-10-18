import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAI } from "../_shared/gigachat-client.ts";
import { accessErrorResponse, readObject, requireActiveUser, requireUuid } from "../_shared/privileged-access.ts";
import { requireSelfExaminationOrder, completeSelfExaminationOrder } from "../_shared/document-operation-access.ts";
import { prepareSelfExaminationVersion, saveSelfExaminationVersion } from "../_shared/self-examination-version.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "X-Sintagma-Function-Revision": "uc-permissions-20261018-v2",
  "Cache-Control": "no-store",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const actor = await requireActiveUser(req, supabase);
    const body = await readObject(req);
    const organizationId = requireUuid(body.organizationId, "организация");
    const orderId = body.orderId == null ? null : requireUuid(body.orderId, "заказ");
    const order = await requireSelfExaminationOrder(supabase, actor, organizationId, orderId);
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization")! } },
    });
    const requestId = body.requestId == null ? crypto.randomUUID() : requireUuid(body.requestId, "идентификатор запроса");
    const operation = await prepareSelfExaminationVersion(userClient, organizationId, requestId, orderId);
    if (operation.replayUrl) {
      await completeSelfExaminationOrder(supabase, order);
      return new Response(JSON.stringify({ success: true, fileUrl: operation.replayUrl, requestId, replayed: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

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
    if (order) {
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

    let reportContent = "";
    try {
      const { text } = await callAI(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        8000,
        "gigachat",
        "GigaChat-Max",
        "google/gemini-2.5-pro",
      );
      reportContent = text || "";
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("AI API error:", msg);

      if (msg.includes("429")) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (msg.includes("402")) {
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

    const fileUrl = await saveSelfExaminationVersion(userClient, organizationId, operation,
      fullHtmlDocument, new Date().getFullYear());

    await completeSelfExaminationOrder(supabase, order);

    console.log("Report generated successfully!");

    return new Response(
      JSON.stringify({
        success: true,
        fileUrl,
        requestId,
        message: "Отчёт о результатах самообследования успешно сгенерирован",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return accessErrorResponse(error, corsHeaders);
  }
});
