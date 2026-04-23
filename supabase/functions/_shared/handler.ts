/**
 * Унифицированная обвязка для edge-функций:
 *  - CORS-заголовки (включая preflight OPTIONS)
 *  - Валидация JWT (опционально)
 *  - Единый формат ответа { ok: true, data } / { ok: false, code, message }
 *  - Безопасная обработка исключений
 *
 * Использование (новые функции):
 *
 *   import { withAuth } from "../_shared/handler.ts";
 *
 *   Deno.serve(withAuth(async ({ user, body }) => {
 *     return { hello: user.email };
 *   }));
 *
 * Или без авторизации (публичный webhook):
 *
 *   import { withHandler } from "../_shared/handler.ts";
 *
 *   Deno.serve(withHandler(async ({ body, req }) => {
 *     return { received: true };
 *   }));
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

export interface JwtClaims {
  sub: string;
  email?: string;
  role?: string;
  exp?: number;
  [key: string]: unknown;
}

export interface HandlerContext {
  req: Request;
  body: unknown;
  user: JwtClaims;
}

export interface PublicHandlerContext {
  req: Request;
  body: unknown;
}

type AuthedHandler = (ctx: HandlerContext) => Promise<unknown> | unknown;
type PublicHandler = (ctx: PublicHandlerContext) => Promise<unknown> | unknown;

export interface HandlerOptions {
  /**
   * Если true — оборачивает ответ в { ok: true, data }.
   * Если false (по умолчанию) — возвращает payload как есть, что совместимо
   * с существующими клиентами, ожидающими «плоский» JSON.
   */
  wrapResponse?: boolean;
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

function ok(data: unknown, wrap: boolean) {
  // Если хендлер уже сам вернул Response — пропускаем без изменений.
  if (data instanceof Response) return data;
  return wrap ? jsonResponse({ ok: true, data }) : jsonResponse(data);
}

function fail(code: string, message: string, status = 400, wrap = true) {
  return wrap
    ? jsonResponse({ ok: false, code, message }, status)
    : jsonResponse({ error: message }, status);
}

async function readBody(req: Request): Promise<unknown> {
  if (req.method === "GET" || req.method === "HEAD") return null;
  const text = await req.text().catch(() => "");
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Edge function with required JWT validation */
export function withAuth(handler: AuthedHandler) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    try {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return fail("unauthorized", "Требуется авторизация", 401);
      }

      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
      if (!supabaseUrl || !anonKey) {
        return fail("config_error", "Сервис не настроен", 500);
      }

      const client = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });

      const token = authHeader.replace("Bearer ", "");
      const { data, error } = await client.auth.getClaims(token);
      if (error || !data?.claims) {
        return fail("unauthorized", "Сессия истекла или недействительна", 401);
      }

      const body = await readBody(req);
      const result = await handler({ req, body, user: data.claims as JwtClaims });
      return ok(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.error("[edge handler error]", msg);
      return fail("internal_error", msg, 500);
    }
  };
}

/** Edge function without auth (e.g. public webhooks) */
export function withHandler(handler: PublicHandler) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }
    try {
      const body = await readBody(req);
      const result = await handler({ req, body });
      return ok(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.error("[edge handler error]", msg);
      return fail("internal_error", msg, 500);
    }
  };
}
