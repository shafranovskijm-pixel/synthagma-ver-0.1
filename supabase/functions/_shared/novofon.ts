// Novofon Call API/Data API JSON-RPC + classic API helpers.
// Docs: https://novofon.github.io/call_api/ and https://novofon.github.io/data_api/
import { encodeHex } from "https://deno.land/std@0.224.0/encoding/hex.ts";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";
import { crypto as stdCrypto } from "https://deno.land/std@0.224.0/crypto/mod.ts";

const CALL_API_BASE = "https://callapi-jsonrpc.novofon.ru/v4.0";
const DATA_API_BASE = "https://dataapi-jsonrpc.novofon.ru/v2.0";
const CLASSIC_API_BASE = "https://api.novofon.com";
const CLASSIC_API_FALLBACK_BASE = "https://api.zadarma.com";

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

export interface NovofonEmployeePhone {
  phone_id?: number;
  phone_number?: string;
  channels_count?: number;
  dial_time?: number;
  status?: string;
}

export interface NovofonEmployee {
  id: number;
  login?: string;
  first_name?: string;
  last_name?: string;
  patronymic?: string;
  full_name?: string;
  status?: string;
  calls_available?: boolean;
  phone_numbers?: NovofonEmployeePhone[];
  extension?: {
    extension_phone_number?: string;
    extension_voice_mail_enabled?: boolean;
    extension_queue_enabled?: boolean;
  };
  call_recording?: string;
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

function isAppId(value?: string | null): boolean {
  return /^appid_/i.test(value?.trim() || "");
}

function addTokenCandidate(candidates: string[], value?: string | null) {
  const raw = value?.trim();
  const normalized = normalizeAccessKey(raw);
  for (const token of [raw, normalized]) {
    if (token && !candidates.includes(token)) candidates.push(token);
  }
}

function getStaticCallAccessTokens(): string[] {
  const candidates: string[] = [];
  addTokenCandidate(candidates, Deno.env.get("NOVOFON_CALL_ACCESS_TOKEN"));
  addTokenCandidate(candidates, Deno.env.get("NOVOFON_JSONRPC_ACCESS_KEY"));
  addTokenCandidate(candidates, Deno.env.get("NOVOFON_ACCESS_TOKEN"));

  // Novofon 2.0 often gives a pair `appid` + `token`. In older project
  // settings this pair may have been saved into NOVOFON_API_KEY/API_SECRET.
  // Classic API uses them as key/secret, but JSON-RPC Call API expects the
  // token itself in params.access_token.
  if (isAppId(Deno.env.get("NOVOFON_API_KEY"))) {
    addTokenCandidate(candidates, Deno.env.get("NOVOFON_API_KEY"));
    addTokenCandidate(candidates, Deno.env.get("NOVOFON_API_SECRET"));
  }

  // In the current Novofon cabinet the API screen shows an AppID + Secret pair.
  // Support confirmed that Secret itself is the access_token for Data API and
  // Call API. Some deployments store this pair as NOVOFON_LOGIN/NOVOFON_PASSWORD
  // (because older docs describe login.user); when login starts with `appid_`,
  // treat password as the permanent access token, not only as a login password.
  if (isAppId(Deno.env.get("NOVOFON_LOGIN")) || isAppId(Deno.env.get("NOVOFON_EMPLOYEE_API_KEY"))) {
    addTokenCandidate(candidates, Deno.env.get("NOVOFON_PASSWORD"));
  }

  return candidates;
}

function getStaticDataAccessTokens(): string[] {
  const candidates: string[] = [];
  addTokenCandidate(candidates, Deno.env.get("NOVOFON_DATA_ACCESS_TOKEN"));
  addTokenCandidate(candidates, Deno.env.get("NOVOFON_CALL_ACCESS_TOKEN"));
  for (const token of getStaticCallAccessTokens()) addTokenCandidate(candidates, token);
  return candidates;
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
  const token = await safeLogin(CALL_API_BASE, "NOVOFON_LOGIN", "NOVOFON_PASSWORD") || getStaticCallAccessTokens()[0];
  if (!token) {
    throw new NovofonApiError(
      "NOVOFON_ACCESS_TOKEN or NOVOFON_LOGIN/NOVOFON_PASSWORD not configured",
      { mnemonic: "call_api_credentials_missing" },
    );
  }
  return token;
}

export async function getDataAccessToken(): Promise<string> {
  const token = await safeLogin(DATA_API_BASE, "NOVOFON_DATA_LOGIN", "NOVOFON_DATA_PASSWORD") || await safeLogin(DATA_API_BASE, "NOVOFON_LOGIN", "NOVOFON_PASSWORD") || getStaticDataAccessTokens()[0];
  if (!token) {
    throw new NovofonApiError(
      "NOVOFON_DATA_ACCESS_TOKEN/NOVOFON_ACCESS_TOKEN or login/password not configured",
      { mnemonic: "data_api_credentials_missing" },
    );
  }
  return token;
}

export function hasCallApiCredentials(): boolean {
  return Boolean(getStaticCallAccessTokens().length || (Deno.env.get("NOVOFON_LOGIN") && Deno.env.get("NOVOFON_PASSWORD")));
}

export function getConfiguredVirtualPhoneNumber(): string {
  return normalizeNovofonPhone(
    Deno.env.get("NOVOFON_PUBLIC_NUMBER")
      || Deno.env.get("NOVOFON_VIRTUAL_PHONE_NUMBER")
      || Deno.env.get("NOVOFON_CALLER_ID")
      || "",
  );
}

export function getConfiguredOperatorNumber(fallback = ""): string {
  return normalizeNovofonPhone(
    Deno.env.get("NOVOFON_TEST_OPERATOR_NUMBER")
      || Deno.env.get("NOVOFON_OPERATOR_NUMBER")
      || fallback,
  );
}

export function getConfiguredSipLogin(): string {
  return (Deno.env.get("NOVOFON_SIP_LINE_LOGIN") || Deno.env.get("NOVOFON_SIP_LOGIN") || "").trim();
}

export function getConfiguredExtension(): string {
  return (Deno.env.get("NOVOFON_VATS_EXTENSION") || "").trim();
}

export function hasClassicApiCredentials(): boolean {
  const explicitKey = Deno.env.get("NOVOFON_CLASSIC_API_KEY")?.trim();
  const explicitSecret = Deno.env.get("NOVOFON_CLASSIC_API_SECRET")?.trim();
  if (explicitKey && explicitSecret) return true;

  const key = Deno.env.get("NOVOFON_API_KEY")?.trim();
  const secret = Deno.env.get("NOVOFON_API_SECRET")?.trim();
  // `appid_...` belongs to Novofon 2.0 app/token pair and is not a valid
  // Classic API user_key for `/v1/request/callback/` signing.
  return Boolean(key && secret && !isAppId(key));
}

function isAuthTokenError(error: unknown): boolean {
  return error instanceof NovofonApiError
    && ["access_token_invalid", "access_token_expired", "access_token_blocked", "auth_error"].includes(error.mnemonic || "");
}

async function jsonRpcWithAccessTokens<T = unknown>(
  baseUrl: string,
  method: string,
  tokens: string[],
  params: Record<string, unknown> = {},
): Promise<T> {
  let lastAuthError: unknown = null;
  for (const accessToken of tokens) {
    try {
      return await jsonRpcRequest<T>(baseUrl, method, { access_token: accessToken, ...params });
    } catch (error) {
      if (!isAuthTokenError(error)) throw error;
      lastAuthError = error;
    }
  }
  if (lastAuthError) throw lastAuthError;
  throw new NovofonApiError("Novofon access token is not configured", { mnemonic: "call_api_credentials_missing" });
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
    if (error.mnemonic === "access_token_invalid" || error.mnemonic === "access_token_expired" || error.mnemonic === "access_token_blocked" || error.mnemonic === "auth_error") {
      return "Novofon не принял Secret/access_token: проверьте вкладку API у пользователя АТС и что ключ активен для Call API/Data API.";
    }
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
  const loginToken = await safeLogin(CALL_API_BASE, "NOVOFON_LOGIN", "NOVOFON_PASSWORD");
  const tokens = [...(loginToken ? [loginToken] : []), ...getStaticCallAccessTokens()];
  return jsonRpcWithAccessTokens<T>(CALL_API_BASE, method, tokens, params);
}

export async function novofonDataRpc<T = unknown>(
  method: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  const dataLoginToken = await safeLogin(DATA_API_BASE, "NOVOFON_DATA_LOGIN", "NOVOFON_DATA_PASSWORD");
  const commonLoginToken = await safeLogin(DATA_API_BASE, "NOVOFON_LOGIN", "NOVOFON_PASSWORD");
  const tokens = [
    ...(dataLoginToken ? [dataLoginToken] : []),
    ...(commonLoginToken ? [commonLoginToken] : []),
    ...getStaticDataAccessTokens(),
  ];
  return jsonRpcWithAccessTokens<T>(DATA_API_BASE, method, tokens, params);
}

function normalizeComparablePhone(raw?: string | null): string {
  return String(raw || "").replace(/\D/g, "");
}

function employeeName(employee: NovofonEmployee): string {
  return employee.full_name || [employee.last_name, employee.first_name, employee.patronymic].filter(Boolean).join(" ") || employee.login || `ID ${employee.id}`;
}

export async function getNovofonEmployees(limit = 100): Promise<NovofonEmployee[]> {
  return await novofonDataRpc<NovofonEmployee[]>("get.employees", {
    limit,
    fields: [
      "id",
      "login",
      "first_name",
      "last_name",
      "patronymic",
      "full_name",
      "status",
      "calls_available",
      "phone_numbers",
      "extension",
      "call_recording",
    ],
  });
}

export async function resolveNovofonEmployee(preferredPhone?: string | null): Promise<{ employee: NovofonEmployee; phoneNumber?: string; reason: string } | null> {
  const employees = await getNovofonEmployees();
  const configuredEmployeeId = Number(Deno.env.get("NOVOFON_EMPLOYEE_ID") || 0) || null;
  const sipLogin = normalizeComparablePhone(getConfiguredSipLogin());
  const extension = normalizeComparablePhone(getConfiguredExtension());
  const operator = normalizeComparablePhone(preferredPhone || getConfiguredOperatorNumber());

  const score = (employee: NovofonEmployee) => {
    const phones = employee.phone_numbers || [];
    const extensionNumber = normalizeComparablePhone(employee.extension?.extension_phone_number);
    if (configuredEmployeeId && employee.id === configuredEmployeeId) return 100;
    if (extension && extensionNumber === extension) return 90;
    if (operator && phones.some((p) => normalizeComparablePhone(p.phone_number) === operator)) return 80;
    if (sipLogin && phones.some((p) => normalizeComparablePhone(p.phone_number) === sipLogin)) return 70;
    if (employee.calls_available) return 20;
    return 1;
  };

  const [best] = employees
    .filter((employee) => employee.id)
    .sort((a, b) => score(b) - score(a));

  if (!best || score(best) <= 1) return null;

  const phones = best.phone_numbers || [];
  const activePhones = phones.filter((p) => !p.status || p.status === "active");
  const phoneByOperator = activePhones.find((p) => operator && normalizeComparablePhone(p.phone_number) === operator)?.phone_number;
  // Novofon accepts `employee.phone_number`, but for SIP lines returned by
  // get.employees it can answer with an internal server error. If no exact
  // external manager phone is configured, omit phone_number and let Novofon
  // dial all active employee numbers by priority — this is the documented and
  // most stable mode.
  const phoneNumber = phoneByOperator && operator.length >= 10 ? phoneByOperator : undefined;

  return {
    employee: best,
    phoneNumber,
    reason: `${employeeName(best)} (${score(best) >= 80 ? "точное совпадение" : "подходящий сотрудник"})`,
  };
}

export async function startNovofonEmployeeCall<T = { call_session_id?: number }>(opts: {
  contact: string;
  virtualPhoneNumber: string;
  operatorNumber?: string;
  externalId?: string;
}): Promise<{ data: T; employee: NovofonEmployee; employeePhoneNumber?: string }> {
  const resolved = await resolveNovofonEmployee(opts.operatorNumber);
  if (!resolved) {
    throw new NovofonApiError("Novofon employee was not found", { mnemonic: "employee_not_found" });
  }

  const data = await novofonRpc<T>("start.employee_call", {
    first_call: "employee",
    switch_at_once: true,
    show_virtual_phone_number: true,
    virtual_phone_number: opts.virtualPhoneNumber,
    direction: "in",
    contact: opts.contact,
    external_id: opts.externalId,
    employee: {
      id: resolved.employee.id,
      ...(resolved.phoneNumber ? { phone_number: resolved.phoneNumber } : {}),
    },
  });

  return { data, employee: resolved.employee, employeePhoneNumber: resolved.phoneNumber };
}

export async function novofonClassicRequest<T = unknown>(
  method: "GET" | "POST",
  path: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  const candidates: Array<{ key: string; secret: string; label: string }> = [];
  addClassicCandidate(candidates, Deno.env.get("NOVOFON_CLASSIC_API_KEY"), Deno.env.get("NOVOFON_CLASSIC_API_SECRET"), "classic");
  addClassicCandidate(candidates, Deno.env.get("NOVOFON_API_KEY"), Deno.env.get("NOVOFON_API_SECRET"), "api_key");

  // Classic REST API v1 (including /v1/webrtc/get_key/) uses
  // Authorization: user_key:signature. In the current Novofon/Zadarma cabinet
  // the user_key can be displayed as appid_..., so it is still valid here.
  if (isAppId(Deno.env.get("NOVOFON_LOGIN"))) {
    addClassicCandidate(candidates, Deno.env.get("NOVOFON_LOGIN"), Deno.env.get("NOVOFON_PASSWORD"), "login_appid");
  }
  if (isAppId(Deno.env.get("NOVOFON_EMPLOYEE_API_KEY"))) {
    addClassicCandidate(candidates, Deno.env.get("NOVOFON_EMPLOYEE_API_KEY"), Deno.env.get("NOVOFON_PASSWORD"), "employee_appid");
  }

  if (!candidates.length) throw new Error("NOVOFON_CLASSIC_API_KEY/SECRET not configured");

  const requestParams = { ...params, format: "json" };
  const paramsStr = buildParamsString(requestParams);
  let lastError: Error | null = null;
  for (const baseUrl of [CLASSIC_API_BASE, CLASSIC_API_FALLBACK_BASE]) {
    const url = method === "GET" && paramsStr
      ? `${baseUrl}${path}?${paramsStr}`
      : `${baseUrl}${path}`;

    for (const candidate of candidates) {
      const md5 = await md5Hex(paramsStr);
      const hex = await hmacSha1Hex(candidate.secret, `${path}${paramsStr}${md5}`);
      const signature = encodeBase64(new TextEncoder().encode(hex));

      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `${candidate.key}:${signature}`,
          Accept: "application/json",
          ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
        },
        body: method === "POST" ? paramsStr : undefined,
      });

      const text = await res.text();
      let json: any;
      try { json = JSON.parse(text); } catch { json = { raw: text }; }

      if (res.ok && json?.status !== "error") return json as T;

      const message = json?.message || text || `HTTP ${res.status}`;
      lastError = new Error(`Novofon ${candidate.label} ${new URL(baseUrl).hostname} HTTP ${res.status}: ${message}`);
      if (!isClassicRecoverableFailure(res.status, message)) throw lastError;
    }
  }

  throw lastError || new Error("Novofon classic API request failed");
}

function addClassicCandidate(
  candidates: Array<{ key: string; secret: string; label: string }>,
  key?: string | null,
  secret?: string | null,
  label = "api",
) {
  const normalizedKey = key?.trim();
  const normalizedSecret = secret?.trim();
  if (!normalizedKey || !normalizedSecret) return;
  if (candidates.some((candidate) => candidate.key === normalizedKey && candidate.secret === normalizedSecret)) return;
  candidates.push({ key: normalizedKey, secret: normalizedSecret, label });
}

function isClassicRecoverableFailure(status: number, message: string): boolean {
  const normalized = message.toLowerCase();
  return status === 401
    || status === 404
    || status === 501
    || normalized.includes("not_authorized")
    || normalized.includes("unauthorized")
    || normalized.includes("method not implemented");
}

// Backwards-compatible alias for classic Zadarma/Novofon REST callers.
export async function novofonRequest<T = unknown>(
  method: string,
  path: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  return novofonClassicRequest<T>(method === "POST" ? "POST" : "GET", path, params);
}
