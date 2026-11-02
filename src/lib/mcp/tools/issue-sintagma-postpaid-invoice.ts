import { defineTool } from "@lovable.dev/mcp-js";
import { issueSintagmaPostpaidInvoice, issuePostpaidInvoiceShape } from "../postpaid-billing";

export default defineTool({
  name: "issue_sintagma_postpaid_invoice",
  title: "Выпустить счёт постоплаты СИНТАГМЫ",
  description: "По поручению администратора выпустить или прочитать уже выпущенный счёт к точно подтверждённому расчёту. Передайте ID организации/расчёта, ожидаемые source_hash, review_hash, тариф и сумму. Сумма и неизменность проверки контролируются в одной транзакции; повтор возвращает тот же счёт. После ошибки сначала перечитайте тот же расчёт, не создавайте дубль. Не отправляет клиенту, не отмечает оплату и не продлевает предоплатную подписку. Договорная безлимитная постоплата сохраняется.",
  inputSchema: issuePostpaidInvoiceShape,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: (input, ctx) => issueSintagmaPostpaidInvoice(input, ctx),
});
