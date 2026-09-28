// Exercise the generated, type-erased deployment artifact in Deno without a server,
// database, user token or network permission. Source typing is checked by tsc.
Deno.test("compiled SINTAGMA MCP boots and rejects unauthenticated HTTP requests", async () => {
  let handler: ((request: Request) => Response | Promise<Response>) | undefined;
  const originalServe = Deno.serve;
  try {
    Deno.serve = ((candidate: typeof handler) => {
      handler = candidate;
      return {};
    }) as typeof Deno.serve;
    await import("../functions/mcp/index.ts");
  } finally {
    Deno.serve = originalServe;
  }
  if (!handler) throw new Error("The deployment artifact did not register an HTTP handler");
  const response = await handler(new Request("https://test.invalid/functions/v1/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
  }));
  if (response.status !== 401) throw new Error(`Expected HTTP 401, received ${response.status}`);
  if (!response.headers.get("www-authenticate")?.includes("resource_metadata")) {
    throw new Error("Missing OAuth resource discovery in the authentication challenge");
  }
  await response.body?.cancel();
});
