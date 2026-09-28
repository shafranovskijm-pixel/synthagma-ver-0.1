import { defineTool } from "@lovable.dev/mcp-js";
import { createPlatformActShape, createSintagmaInvoiceAct } from "../platform-acts";
export default defineTool({
  name: "create_sintagma_invoice_act", title: "Создать акт к счёту СИНТАГМЫ",
  description: "Только по команде администратора: сохранить акт на полную сумму существующего subscription_invoice по шаблону СИНТАГМЫ. Сначала preview; используйте его точные ID, дату, source_sha256 и request_id. Повторите тот же request_id после сбоя: это завершает сохранение без дубля. Изменение исходного счёта требует нового preview. Уже существующий акт не перезаписывается. Не меняет счёт или оплату, не подписывает электронной подписью и не отправляет клиенту.",
  inputSchema: createPlatformActShape,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: (input, ctx) => createSintagmaInvoiceAct(input, ctx),
});
