import { defineTool } from "@lovable.dev/mcp-js";
import { prepareSintagmaPostpaidStatement, preparePostpaidStatementShape } from "../postpaid-billing";

export default defineTool({
  name: "prepare_sintagma_postpaid_statement",
  title: "Подготовить расчёт постоплаты СИНТАГМЫ",
  description: "По поручению администратора подготовить или прочитать существующий месячный черновик точно выбранной организации. Только завершившийся календарный месяц по Москве; period_start — первое число. Повтор без изменения источников возвращает прежнюю ревизию, уже выпущенный счёт не пересоздаётся. Не подтверждает неполную историю, не выпускает счёт, не отправляет письмо и не отмечает оплату.",
  inputSchema: preparePostpaidStatementShape,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: (input, ctx) => prepareSintagmaPostpaidStatement(input, ctx),
});
