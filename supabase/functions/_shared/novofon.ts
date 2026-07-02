// Zadarma / Novofon API signing helper.
// Docs: https://novofon.github.io/call_api/
import { encodeHex } from "https://deno.land/std@0.224.0/encoding/hex.ts";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";
import { crypto as stdCrypto } from "https://deno.land/std@0.224.0/crypto/mod.ts";

const API_BASE = "https://api.novofon.com";

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
  const buf = await crypto.subtle.digest("MD5", new TextEncoder().encode(msg));
  return encodeHex(new Uint8Array(buf));
}

function buildParamsString(params: Record<string, string | number>): string {
  const keys = Object.keys(params).sort();
  return keys.map((k) => `${k}=${params[k]}`).join("&");
}

export async function novofonRequest<T = unknown>(
  method: string,
  path: string,
  params: Record<string, string | number> = {},
): Promise<T> {
  const key = Deno.env.get("NOVOFON_API_KEY");
  const secret = Deno.env.get("NOVOFON_API_SECRET");
  if (!key || !secret) throw new Error("NOVOFON_API_KEY/SECRET not configured");

  const paramsStr = buildParamsString(params);
  const md5 = await md5Hex(paramsStr);
  const signBase = `${path}${paramsStr}${md5}`;
  const hex = await hmacSha1Hex(secret, signBase);
  const signature = encodeBase64(new TextEncoder().encode(hex));

  const url = paramsStr
    ? `${API_BASE}${path}?${paramsStr}`
    : `${API_BASE}${path}`;

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `${key}:${signature}`,
      Accept: "application/json",
    },
  });

  const text = await res.text();
  let json: unknown;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) {
    throw new Error(`Novofon ${res.status}: ${text}`);
  }
  return json as T;
}
