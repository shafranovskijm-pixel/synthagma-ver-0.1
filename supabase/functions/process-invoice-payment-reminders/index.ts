import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Дни просрочки/приближения, на которые шлём напоминание
const REMIND_DAYS = [3, 7, 14, 30];

interface InvoiceRow {
  id: string;
  company_id: string;
  contract_number: string | null;
  contract_date: string | null;
  amount: number | null;
  is_paid: boolean | null;
  uploaded_at: string;
  name: string;
}

function buildEmailHtml(opts: {
  companyName: string;
  invoiceName: string;
  invoiceNumber: string;
  amount: number | null;
  daysOverdue: number;
  contractDate: string | null;
}): string {
  const amountStr = opts.amount
    ? new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 2 }).format(opts.amount)
    : "—";
  const status = opts.daysOverdue > 0
    ? `${opts.daysOverdue} дн. просрочки`
    : `до оплаты осталось ${Math.abs(opts.daysOverdue)} дн.`;

  return `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; background: #ffffff; color: #1a1a1a;">
      <h2 style="color: #0d9488; margin: 0 0 16px;">Напоминание об оплате счёта</h2>
      <p>Уважаемый клиент <strong>${opts.companyName}</strong>,</p>
      <p>Напоминаем, что счёт <strong>${opts.invoiceName}</strong> до сих пор не оплачен.</p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr><td style="padding: 8px 0; color: #6b7280;">Номер счёта:</td><td style="padding: 8px 0; font-weight: 600;">${opts.invoiceNumber}</td></tr>
        ${opts.contractDate ? `<tr><td style="padding: 8px 0; color: #6b7280;">Дата:</td><td style="padding: 8px 0;">${new Date(opts.contractDate).toLocaleDateString("ru-RU")}</td></tr>` : ""}
        <tr><td style="padding: 8px 0; color: #6b7280;">Сумма:</td><td style="padding: 8px 0; font-weight: 600;">${amountStr}</td></tr>
        <tr><td style="padding: 8px 0; color: #6b7280;">Статус:</td><td style="padding: 8px 0; color: #dc2626; font-weight: 600;">${status}</td></tr>
      </table>
      <p style="color: #6b7280; font-size: 13px;">Если оплата уже произведена — пожалуйста, проигнорируйте это сообщение. Подтверждение поступит в течение 1–2 рабочих дней после зачисления.</p>
      <p style="color: #9ca3af; font-size: 12px; margin-top: 32px;">— Платформа Синтагма (sintagma.com.ru)</p>
    </div>
  `;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Берём все неоплаченные счета (тип = invoice) за последние 90 дней
    const cutoff = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { data: invoices, error } = await supabase
      .from("company_documents")
      .select("id, company_id, contract_number, contract_date, amount, is_paid, uploaded_at, name")
      .eq("type", "invoice")
      .or("is_paid.eq.false,is_paid.is.null")
      .gte("uploaded_at", cutoff)
      .is("deleted_at", null);

    if (error) throw error;

    let sent = 0;
    let skipped = 0;
    let errors = 0;

    for (const inv of (invoices || []) as InvoiceRow[]) {
      // Целевая дата: contract_date если есть, иначе uploaded_at
      const baseDate = inv.contract_date ? new Date(inv.contract_date) : new Date(inv.uploaded_at);
      baseDate.setHours(0, 0, 0, 0);
      const diffDays = Math.floor((today.getTime() - baseDate.getTime()) / (1000 * 60 * 60 * 24));

      // Шлём только в один из заданных дней
      if (!REMIND_DAYS.includes(diffDays)) {
        skipped++;
        continue;
      }

      // Получаем компанию (email + название)
      const { data: company } = await supabase
        .from("companies")
        .select("name, email, login_email, organization_id")
        .eq("id", inv.company_id)
        .maybeSingle();

      const recipient = company?.email || company?.login_email;
      if (!recipient) {
        skipped++;
        continue;
      }

      // Дедупликация: проверяем лог за сегодня
      const { data: existingLog } = await supabase
        .from("document_issuance_log")
        .select("id")
        .eq("organization_id", company.organization_id)
        .eq("document_type", "invoice_reminder")
        .eq("send_number", inv.id)
        .gte("issued_at", today.toISOString())
        .maybeSingle();

      if (existingLog) {
        skipped++;
        continue;
      }

      const html = buildEmailHtml({
        companyName: company.name,
        invoiceName: inv.name,
        invoiceNumber: inv.contract_number || inv.id.slice(0, 8),
        amount: inv.amount,
        daysOverdue: diffDays,
        contractDate: inv.contract_date,
      });

      const subject = diffDays > 0
        ? `Просрочен счёт ${inv.contract_number || ""} — ${diffDays} дн.`
        : `Напоминание об оплате счёта ${inv.contract_number || ""}`;

      try {
        const { error: emailErr } = await supabase.functions.invoke("send-email", {
          body: { to: recipient, subject, html },
        });
        if (emailErr) throw emailErr;

        // Логируем в document_issuance_log для дедупликации
        await supabase.from("document_issuance_log").insert({
          organization_id: company.organization_id,
          user_id: inv.company_id,
          user_name: company.name,
          document_type: "invoice_reminder",
          document_name: `Напоминание: ${inv.name}`,
          send_method: "email",
          send_number: inv.id,
        });

        sent++;
      } catch (e) {
        console.error(`Failed to send reminder for invoice ${inv.id}:`, e);
        errors++;
      }
    }

    return new Response(
      JSON.stringify({ ok: true, sent, skipped, errors, total: invoices?.length || 0 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("process-invoice-payment-reminders error:", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
