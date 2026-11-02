import { defineTool } from "@lovable.dev/mcp-js";
import { getSintagmaPostpaidBillingOverview, postpaidOverviewShape } from "../postpaid-billing";

export default defineTool({
  name: "get_sintagma_postpaid_billing_overview",
  title: "Расчёты постоплаты СИНТАГМЫ",
  description: "Только администратор: прочитать условия и сохранённые месячные расчёты точно выбранной организации. Личные заметки, подтверждения клиента и идентификаторы проверяющих не возвращаются. Состояние расчёта, выпуск счёта и оплата различаются. Ничего не меняет и не отправляет.",
  inputSchema: postpaidOverviewShape,
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: (input, ctx) => getSintagmaPostpaidBillingOverview(input, ctx),
});
