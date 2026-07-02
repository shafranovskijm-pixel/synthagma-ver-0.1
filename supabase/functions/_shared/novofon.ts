// Novofon Call API/Data API JSON-RPC + classic API helpers.
// Docs: https://novofon.github.io/call_api/ and https://novofon.github.io/data_api/
import { encodeHex } from "https://deno.land/std@0.224.0/encoding/hex.ts";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";
import { crypto as stdCrypto } from "https://deno.land/std@0.224.0/crypto/mod.ts";

const CALL_API_BASE = "https://callapi-jsonrpc.novofon.ru/v4.0";
const DATA_API_BASE = "https://dataapi-jsonrpc.novofon.ru/v2.0";
const CLASSIC_API_BASE = "https://api.zadarma.com";

export interface NovofonJsonRpcError {
  code?: number;
  message?: string;
  data?: {
    mnemonic?: string;
    field?: string;
    value?: string;
    extended_helper?: string;
    params?: Record<string, unknown>;
    metadata?: unknown;
  } | unknown;
}

export interface JsonRpcEnvelope<T> {
  jsonrpc: "2.0";
  id: string;
  result?: { data?: T; metadata?: unknown };
  error?: NovofonJsonRpcError;
}

export class NovofonApiError extends Error {
  readonly code?: number;
  readonly mnemonic?: string;
  readonly status?: number;
  readonly body?: string;
  readonly details?: unknown;

  constructor(message: string, opts: { code?: number; mnemonic?: string; status?: number; body?: string; details?: unknown } = {}) {
    super(message);
    this.name = "NovofonApiError";
    this.code = opts.code;
    this.mnemonic = opts.mnemonic;
    this.status = opts.status;
    this.body = opts.body;
    this.details = opts.details;
  }
}

function jsonRpcId(): string {
  return `sintagma-${Date.now()}-${crypto.randomUUID()}`;
}

function parseMnemonic(data: unknown): string | undefined {
  return data && typeof data === "object" && "mnemonic" in data
    ? String((data as { mnemonic?: unknown }).mnemonic ?? "") || undefined
    : undefined;
}

function normalizeAccessKey(value?: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^appid_\d+[_:.-](.+)$/i);
  return match?.[1]?.trim() || trimmed;
}

function getStaticCallAccessToken(): string | null {
  return normalizeAccessKey(Deno.env.get("NOVOFON_JSONRPC_ACCESS_KEY"))
    || normalizeAccessKey(Deno.env.get("NOVOFON_ACCESS_TOKEN"))
    || null;
}

function getStaticDataAccessToken(): string | null {
  return normalizeAccessKey(Deno.env.get("NOVOFON_DATA_ACCESS_TOKEN")) || getStaticCallAccessToken();
}

async function jsonRpcRequest<T = unknown>(
  baseUrl: string,
  method: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  const id = jsonRpcId();
  const res = await fetch(baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      Accept: "application/json",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });

  const text = await res.text();
  let json: JsonRpcEnvelope<T> | { raw: string };
  try { json = JSON.parse(text); } catch { json = { raw: text }; }

  if (!res.ok) {
    throw new NovofonApiError(`Novofon HTTP ${res.status}: ${text}`, { status: res.status, body: text, details: json });
  }
  if ("error" in json && json.error) {
    const message = json.error.message || "unknown_error";
    throw new NovofonApiError(`Novofon ${json.error.code ?? "error"}: ${message}`, {
      code: json.error.code,
      mnemonic: parseMnemonic(json.error.data),
      body: text,
      details: json.error,
    });
  }

  return ((json as JsonRpcEnvelope<T>).result?.data ?? json) as T;
}

async function login(baseUrl: string, loginEnv: string, passwordEnv: string): Promise<string | null> {
  const loginValue = Deno.env.get(loginEnv)?.trim();
  const password = Deno.env.get(passwordEnv)?.trim();
  if (!loginValue || !password) return null;
  const data = await jsonRpcRequest<{ access_token?: string }>(baseUrl, "login.user", {
    login: loginValue,
    password,
  });
  return data.access_token || null;
}

async function safeLogin(baseUrl: string, loginEnv: string, passwordEnv: string): Promise<string | null> {
  try {
    return await login(baseUrl, loginEnv, passwordEnv);
  } catch (error) {
    if (error instanceof NovofonApiError && (error.mnemonic === "auth_error" || error.mnemonic === "access_token_invalid")) {
      return null;
    }
    throw error;
  }
}

export async function getCallAccessToken(): Promise<string> {
  // A manually saved NOVOFON_ACCESS_TOKEN can expire or be copied from the
  // wrong Novofon API section. If account login/password are configured, always
  // mint a fresh 1-hour Call API session first and use the static token only as
  // a fallback.
  const token = await safeLogin(CALL_API_BASE, "NOVOFON_LOGIN", "NOVOFON_PASSWORD") || getStaticCallAccessToken();
  if (!token) {
    throw new NovofonApiError(
      "NOVOFON_ACCESS_TOKEN or NOVOFON_LOGIN/NOVOFON_PASSWORD not configured",
      { mnemonic: "call_api_credentials_missing" },
    );
  }
  return token;
}

export async function getDataAccessToken(): Promise<string> {
  const token = await safeLogin(DATA_API_BASE, "NOVOFON_DATA_LOGIN", "NOVOFON_DATA_PASSWORD") || await safeLogin(DATA_API_BASE, "NOVOFON_LOGIN", "NOVOFON_PASSWORD") || getStaticDataAccessToken();
  if (!token) {
    throw new NovofonApiError(
      "NOVOFON_DATA_ACCESS_TOKEN/NOVOFON_ACCESS_TOKEN or login/password not configured",
      { mnemonic: "data_api_credentials_missing" },
    );
  }
  return token;
}

export function hasCallApiCredentials(): boolean {
  return Boolean(getStaticCallAccessToken() || (Deno.env.get("NOVOFON_LOGIN") && Deno.env.get("NOVOFON_PASSWORD")));
}

export function normalizeNovofonPhone(raw: string): string {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8")) return "7" + digits.slice(1);
  if (digits.length === 10) return "7" + digits;
  return digits;
}

export function describeNovofonError(error: unknown): string {
  if (error instanceof NovofonApiError) {
    if (error.mnemonic === "call_api_credentials_missing") {
      return "Не задан Call API токен Novofon или резервные NOVOFON_API_KEY/NOVOFON_API_SECRET.";
    }
    if (error.mnemonic === "data_api_credentials_missing") {
      return "Не задан Data API токен Novofon. Добавьте NOVOFON_DATA_ACCESS_TOKEN или NOVOFON_LOGIN/NOVOFON_PASSWORD.";
    }
    if (error.mnemonic === "ip_not_whitelisted") return "IP backend-функции не добавлен в белый список Novofon API.";
    if (error.mnemonic === "component_disabled" || error.mnemonic === "method_component_disabled") return "В Novofon не подключён нужный компонент Call API/Data API.";
    if (error.mnemonic === "access_token_invalid" || error.mnemonic === "access_token_expired" || error.mnemonic === "access_token_blocked" || error.mnemonic === "auth_error") return "Неверный или просроченный токен/логин Novofon API.";
    if (error.mnemonic === "virtual_phone_number_not_found") return "Купленный номер не найден среди виртуальных номеров аккаунта Novofon.";
    if (error.mnemonic === "own_virtual_phone_number_not_allowed") return "Novofon запрещает звонить на собственный виртуальный номер — укажите внешний тестовый номер.";
  }
  return error instanceof Error ? error.message : String(error);
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
  return jsonRpcRequest<T>(CALL_API_BASE, method, { access_token: await getCallAccessToken(), ...params });
}

export async function novofonDataRpc<T = unknown>(
  method: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  return jsonRpcRequest<T>(DATA_API_BASE, method, { access_token: await getDataAccessToken(), ...params });
}

export async function novofonClassicRequest<T = unknown>(
  method: "GET" | "POST",
  path: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  const key = Deno.env.get("NOVOFON_API_KEY")?.trim();
  const secret = Deno.env.get("NOVOFON_API_SECRET")?.trim();
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
