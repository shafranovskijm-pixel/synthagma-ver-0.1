import { defineTool } from "@lovable.dev/mcp-js";
import { approveSintagmaPostpaidStatement, approvePostpaidStatementShape } from "../postpaid-billing";

export default defineTool({
  name: "approve_sintagma_postpaid_statement",
  title: "Подтвердить расчёт постоплаты СИНТАГМЫ",
  description: "По поручению администратора подтвердить один закрытый месячный расчёт после предметной сверки. Передайте точные ID, ожидаемые source_hash, тариф и сумму из предпросмотра, явные проверенные количества курсов/обучавшихся и письменное основание. База атомарно проверяет организацию, свежесть и сумму. Повтор того же подтверждения сохраняет прежний результат; конфликт требует нового чтения. Не создаёт счёт, не отправляет письмо и не подтверждает оплату.",
  inputSchema: approvePostpaidStatementShape,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: (input, ctx) => approveSintagmaPostpaidStatement(input, ctx),
});
