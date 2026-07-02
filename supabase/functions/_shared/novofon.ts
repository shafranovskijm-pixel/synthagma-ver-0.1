// Novofon Call API JSON-RPC helper.
// Docs: https://novofon.github.io/call_api/

const CALL_API_BASE = "https://callapi-jsonrpc.novofon.ru/v4.0";

interface JsonRpcEnvelope<T> {
  jsonrpc: "2.0";
  id: string;
  result?: { data?: T; metadata?: unknown };
  error?: { code?: number; message?: string; data?: unknown };
}

function getAccessToken(): string {
  const token = Deno.env.get("NOVOFON_ACCESS_TOKEN") || Deno.env.get("NOVOFON_API_KEY");
  if (!token) throw new Error("NOVOFON_ACCESS_TOKEN or NOVOFON_API_KEY not configured");
  return token;
}

export async function novofonRpc<T = unknown>(
  method: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  const id = `sintagma-${Date.now()}-${crypto.randomUUID()}`;
  const res = await fetch(CALL_API_BASE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      Accept: "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params: { access_token: getAccessToken(), ...params },
    }),
  });

  const text = await res.text();
  let json: JsonRpcEnvelope<T> | { raw: string };
  try { json = JSON.parse(text); } catch { json = { raw: text }; }

  if (!res.ok) throw new Error(`Novofon HTTP ${res.status}: ${text}`);
  if ("error" in json && json.error) {
    const message = json.error.message || "unknown_error";
    throw new Error(`Novofon ${json.error.code ?? "error"}: ${message}`);
  }

  return ((json as JsonRpcEnvelope<T>).result?.data ?? json) as T;
}

// Backwards-compatible alias for callers that only need JSON-RPC now.
export async function novofonRequest<T = unknown>(
  _method: string,
  pathOrMethod: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  return novofonRpc<T>(pathOrMethod, params);
}
