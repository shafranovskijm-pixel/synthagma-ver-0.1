// Novofon Call API JSON-RPC + classic API helpers.
// Docs: https://novofon.github.io/call_api/
import { encodeHex } from "https://deno.land/std@0.224.0/encoding/hex.ts";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";
import { crypto as stdCrypto } from "https://deno.land/std@0.224.0/crypto/mod.ts";

const CALL_API_BASE = "https://callapi-jsonrpc.novofon.ru/v4.0";
const CLASSIC_API_BASE = "https://api.zadarma.com";

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

async function hmacSha1Hex(key: string, msg: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(msg));
  return encodeHex(new Uint8Array(sig));
}

async function md5Hex(msg: string): Promise<string> {
  const buf = await stdCrypto.subtle.digest("MD5", new TextEncoder().encode(msg));
  return encodeHex(new Uint8Array(buf));
}

function buildParamsString(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  Object.keys(params).sort().forEach((key) => {
    const value = params[key];
    if (value === undefined || value === null || value === "") return;
    search.append(key, String(value));
  });
  return search.toString().replace(/%20/g, "+");
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

export async function novofonClassicRequest<T = unknown>(
  method: "GET" | "POST",
  path: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  const key = Deno.env.get("NOVOFON_API_KEY");
  const secret = Deno.env.get("NOVOFON_API_SECRET");
  if (!key || !secret) throw new Error("NOVOFON_API_KEY/SECRET not configured");

  const requestParams = { ...params, format: "json" };
  const paramsStr = buildParamsString(requestParams);
  const md5 = await md5Hex(paramsStr);
  const hex = await hmacSha1Hex(secret, `${path}${paramsStr}${md5}`);
  const signature = encodeBase64(new TextEncoder().encode(hex));
  const url = method === "GET" && paramsStr
    ? `${CLASSIC_API_BASE}${path}?${paramsStr}`
    : `${CLASSIC_API_BASE}${path}`;

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `${key}:${signature}`,
      Accept: "application/json",
      ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: method === "POST" ? paramsStr : undefined,
  });

  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) throw new Error(`Novofon HTTP ${res.status}: ${text}`);
  if (json?.status === "error") throw new Error(`Novofon: ${json.message || "unknown_error"}`);
  return json as T;
}

// Backwards-compatible alias for classic Zadarma/Novofon REST callers.
export async function novofonRequest<T = unknown>(
  method: string,
  path: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  return novofonClassicRequest<T>(method === "POST" ? "POST" : "GET", path, params);
}
