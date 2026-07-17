import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";

export default defineTool({
  name: "whoami",
  title: "Кто я",
  description: "Возвращает идентификатор и email текущего пользователя платформы СИНТАГМА.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: (_input, ctx: ToolContext) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Не авторизован" }], isError: true };
    }
    const info = {
      user_id: ctx.getUserId(),
      email: ctx.getUserEmail(),
      client_id: ctx.getClientId(),
    };
    return {
      content: [{ type: "text", text: JSON.stringify(info, null, 2) }],
      structuredContent: info,
    };
  },
});
