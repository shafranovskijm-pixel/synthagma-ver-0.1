import { defineTool } from "@lovable.dev/mcp-js";
import { searchInvoiceShape, searchSintagmaInvoices } from "../invoice-source";

export default defineTool({
  name: "search_sintagma_invoices",
  title: "Найти счета СИНТАГМА",
  description: "Читает существующие счета в явно указанной организации через права пользователя. Для company_document обязателен company_id. Не создаёт документы и не отправляет письма. Неизвестные реквизиты возвращаются null.",
  inputSchema: searchInvoiceShape,
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: (input, ctx) => searchSintagmaInvoices(input, ctx),
});
