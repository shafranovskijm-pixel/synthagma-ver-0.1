import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

export interface ReconciliationRow {
  date: string;
  doc_kind: "contract" | "invoice" | "act" | "payment";
  doc_label: string;
  debit: number;   // organization owes / charges
  credit: number;  // company paid
}

export interface ReconciliationParams {
  organizationId: string;
  organizationName: string;
  organizationInn: string | null;
  companyId: string;
  companyName: string;
  companyInn: string | null;
  periodFrom: Date;
  periodTo: Date;
}

export interface GeneratedReconciliation {
  html: string;
  docName: string;
  organizationId: string;
  companyId: string;
  totalDebit: number;
  totalCredit: number;
  balance: number;
  rowCount: number;
}

function fmt(n: number): string {
  return n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Build reconciliation rows by reading invoices, acts and payments for the company.
 * - invoices increase debit (company owes for issued services)
 * - paid invoices add credit on `paid_at`
 * - acts are informational rows (no money movement)
 */
async function loadRows(p: ReconciliationParams): Promise<ReconciliationRow[]> {
  const fromIso = p.periodFrom.toISOString();
  const toIso = p.periodTo.toISOString();

  const { data: docs } = await supabase
    .from("company_documents")
    .select("id, type, name, contract_number, contract_date, amount, is_paid, paid_at, uploaded_at")
    .eq("company_id", p.companyId)
    .in("type", ["contract", "invoice", "act"])
    .or(`uploaded_at.gte.${fromIso},paid_at.gte.${fromIso}`)
    .order("uploaded_at", { ascending: true });

  const rows: ReconciliationRow[] = [];

  for (const d of docs ?? []) {
    const docDateRaw = (d as any).contract_date || (d as any).uploaded_at;
    const docDate = new Date(docDateRaw);
    const inRange = docDate >= p.periodFrom && docDate <= p.periodTo;
    const number = (d as any).contract_number ? `№ ${(d as any).contract_number}` : "";
    const dateLabel = format(docDate, "dd.MM.yyyy");
    const amount = Number((d as any).amount) || 0;

    if (d.type === "invoice" && inRange) {
      rows.push({
        date: dateLabel,
        doc_kind: "invoice",
        doc_label: `Счёт ${number} от ${dateLabel}`,
        debit: amount,
        credit: 0,
      });
    }
    if (d.type === "invoice" && (d as any).is_paid && (d as any).paid_at) {
      const paidDate = new Date((d as any).paid_at);
      if (paidDate >= p.periodFrom && paidDate <= p.periodTo) {
        rows.push({
          date: format(paidDate, "dd.MM.yyyy"),
          doc_kind: "payment",
          doc_label: `Оплата по счёту ${number}`,
          debit: 0,
          credit: amount,
        });
      }
    }
    if (d.type === "contract" && inRange) {
      rows.push({
        date: dateLabel,
        doc_kind: "contract",
        doc_label: `Договор ${number} от ${dateLabel}`,
        debit: 0,
        credit: 0,
      });
    }
    if (d.type === "act" && inRange) {
      rows.push({
        date: dateLabel,
        doc_kind: "act",
        doc_label: `Акт ${number} от ${dateLabel}`,
        debit: 0,
        credit: 0,
      });
    }
  }

  rows.sort((a, b) => a.date.split(".").reverse().join("").localeCompare(b.date.split(".").reverse().join("")));
  return rows;
}

export async function generateReconciliationActHtml(
  p: ReconciliationParams,
): Promise<GeneratedReconciliation | null> {
  try {
    const rows = await loadRows(p);
    const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
    const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
    const balance = totalDebit - totalCredit;

    const periodLabel = `${format(p.periodFrom, "dd MMMM yyyy", { locale: ru })} — ${format(p.periodTo, "dd MMMM yyyy", { locale: ru })}`;

    const balanceText =
      balance > 0
        ? `Задолженность <strong>${p.companyName}</strong> в пользу <strong>${p.organizationName}</strong> составляет <strong>${fmt(balance)} руб.</strong>`
        : balance < 0
        ? `Переплата <strong>${p.companyName}</strong> в пользу <strong>${p.organizationName}</strong> составляет <strong>${fmt(-balance)} руб.</strong>`
        : `На конец периода взаимных задолженностей нет.`;

    const tableRows = rows.length
      ? rows
          .map(
            (r, i) => `
        <tr>
          <td style="text-align:center">${i + 1}</td>
          <td>${r.date}</td>
          <td>${r.doc_label}</td>
          <td style="text-align:right">${r.debit > 0 ? fmt(r.debit) : "—"}</td>
          <td style="text-align:right">${r.credit > 0 ? fmt(r.credit) : "—"}</td>
        </tr>`,
          )
          .join("")
      : `<tr><td colspan="5" style="text-align:center; color:#666; padding:18px">Документов за период не найдено</td></tr>`;

    const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>Акт сверки взаиморасчётов</title>
  <style>
    @page { size: A4; margin: 15mm 18mm; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .signatures { page-break-inside: avoid; } }
    body { font-family: 'Times New Roman', Times, serif; font-size: 12pt; line-height: 1.4; color: #000; padding: 30px 40px; }
    .title { text-align: center; font-weight: bold; font-size: 16pt; margin-bottom: 6px; }
    .subtitle { text-align: center; font-size: 12pt; margin-bottom: 18px; }
    .parties { margin: 16px 0; }
    .parties p { margin: 4px 0; }
    table.rec { width: 100%; border-collapse: collapse; margin: 14px 0; }
    table.rec th, table.rec td { border: 1px solid #000; padding: 6px 8px; font-size: 11pt; }
    table.rec th { background: #f0f0f0; text-align: center; }
    .totals { width: 100%; border-collapse: collapse; margin-top: 8px; }
    .totals td { padding: 6px 8px; border: 1px solid #000; font-size: 11pt; }
    .totals .lbl { background: #f7f7f7; font-weight: bold; width: 60%; }
    .totals .num { text-align: right; }
    .balance { margin: 18px 0; padding: 12px 16px; background: #fffaea; border: 1px solid #d9c97a; border-radius: 4px; font-size: 12pt; }
    .signatures { display: flex; gap: 40px; margin-top: 40px; page-break-inside: avoid; }
    .sig { flex: 1; }
    .sig-title { font-weight: bold; border-bottom: 1px solid #000; padding-bottom: 4px; margin-bottom: 60px; }
    .sig-line { border-top: 1px solid #000; padding-top: 4px; font-size: 10pt; }
  </style>
</head>
<body>
  <div class="title">АКТ СВЕРКИ ВЗАИМОРАСЧЁТОВ</div>
  <div class="subtitle">за период ${periodLabel}</div>

  <div class="parties">
    <p>между <strong>${p.organizationName}</strong>${p.organizationInn ? `, ИНН ${p.organizationInn}` : ""} (далее — Исполнитель)</p>
    <p>и <strong>${p.companyName}</strong>${p.companyInn ? `, ИНН ${p.companyInn}` : ""} (далее — Заказчик).</p>
  </div>

  <p>Мы, нижеподписавшиеся, составили настоящий акт о том, что состояние взаимных расчётов по данным учёта следующее:</p>

  <table class="rec">
    <thead>
      <tr>
        <th style="width:36px">№</th>
        <th style="width:90px">Дата</th>
        <th>Документ / операция</th>
        <th style="width:120px">Дебет, руб.</th>
        <th style="width:120px">Кредит, руб.</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>

  <table class="totals">
    <tr><td class="lbl">Итого начислено (дебет)</td><td class="num">${fmt(totalDebit)} руб.</td></tr>
    <tr><td class="lbl">Итого оплачено (кредит)</td><td class="num">${fmt(totalCredit)} руб.</td></tr>
    <tr><td class="lbl">Сальдо на конец периода</td><td class="num"><strong>${fmt(balance)} руб.</strong></td></tr>
  </table>

  <div class="balance">${balanceText}</div>

  <div class="signatures">
    <div class="sig">
      <div class="sig-title">От Исполнителя</div>
      <div class="sig-line">${p.organizationName}</div>
      <div style="font-size:10pt; color:#444; margin-top:4px">М.П. _________________</div>
    </div>
    <div class="sig">
      <div class="sig-title">От Заказчика</div>
      <div class="sig-line">${p.companyName}</div>
      <div style="font-size:10pt; color:#444; margin-top:4px">М.П. _________________</div>
    </div>
  </div>
</body>
</html>`;

    const docName = `Акт сверки ${p.companyName} (${format(p.periodFrom, "dd.MM.yyyy")}–${format(p.periodTo, "dd.MM.yyyy")})`;

    return {
      html,
      docName,
      organizationId: p.organizationId,
      companyId: p.companyId,
      totalDebit,
      totalCredit,
      balance,
      rowCount: rows.length,
    };
  } catch (e) {
    console.error("Reconciliation generation error:", e);
    return null;
  }
}

/**
 * Persist the generated reconciliation act:
 * - upload HTML to billing-documents bucket
 * - insert row into company_documents with type='act'
 */
export async function saveReconciliationAct(act: GeneratedReconciliation): Promise<string | null> {
  try {
    const blob = new Blob([act.html], { type: "text/html;charset=utf-8" });
    const fileName = `${act.organizationId}/reconciliations/rec_${Date.now()}.html`;

    const { error: uploadError } = await supabase.storage
      .from("billing-documents")
      .upload(fileName, blob, { contentType: "text/html;charset=utf-8" });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return null;
    }

    const { error: dbError } = await supabase.from("company_documents").insert({
      company_id: act.companyId,
      name: act.docName,
      type: "act",
      file_path: fileName,
      amount: act.balance,
    } as any);

    if (dbError) {
      console.error("DB insert error:", dbError);
      return null;
    }

    return act.docName;
  } catch (e) {
    console.error("saveReconciliationAct error:", e);
    return null;
  }
}
