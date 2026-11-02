import { defineTool } from "@lovable.dev/mcp-js";
import { previewSintagmaPostpaidStatement, previewPostpaidStatementShape } from "../postpaid-billing";

export default defineTool({
  name: "preview_sintagma_postpaid_statement",
  title: "Проверить расчёт постоплаты СИНТАГМЫ",
  description: "Только администратор: проверить точные organization_id и statement_id. Возвращает сохранённый расчёт, свежие показатели, серверную цену и хеши для подтверждения/выпуска. Ретроспективные данные требуют предметной сверки; отсутствие событий не доказывает отсутствие прежнего обучения. Ничего не сохраняет и не отправляет.",
  inputSchema: previewPostpaidStatementShape,
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: (input, ctx) => previewSintagmaPostpaidStatement(input, ctx),
});
