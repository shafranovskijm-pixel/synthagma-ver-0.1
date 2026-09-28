import { defineTool } from "@lovable.dev/mcp-js";
import { exportInvoiceShape, getSintagmaInvoiceExport } from "../invoice-source";

export default defineTool({
  name: "get_sintagma_invoice_export",
  title: "Получить исходный счёт СИНТАГМА",
  description: "Читает один существующий счёт в явно указанной организации и выдаёт краткоживущую ссылку на сохранённый файл. Для company_document обязателен company_id. subscription_invoice возвращает artifact_missing: исходный PDF в записи не хранится. Ничего не переносит и не отправляет; ссылка не подтверждает проверку содержимого файла.",
  inputSchema: exportInvoiceShape,
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: (input, ctx) => getSintagmaInvoiceExport(input, ctx),
});
