import { defineTool } from "@lovable.dev/mcp-js";
import { searchBillingOrganizationsShape, searchSintagmaBillingOrganizations } from "../platform-acts";
export default defineTool({
  name: "search_sintagma_billing_organizations", title: "Найти клиента платформы СИНТАГМА",
  description: "Только администратор: найти организации по названию или ИНН для работы со счетами за платформу. Возвращает точные ID и реквизиты, без паролей и посторонних данных. При нескольких совпадениях уточните организацию.",
  inputSchema: searchBillingOrganizationsShape,
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: (input, ctx) => searchSintagmaBillingOrganizations(input, ctx),
});
