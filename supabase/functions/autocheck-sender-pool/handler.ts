export interface SenderPoolCheckRow {
  id: string;
  email: string;
  app_password: string | null;
  host: string;
  port: number;
  encryption: string;
  from_name: string | null;
}

export type SenderPoolCheckAuthorization =
  | { ok: true }
  | { ok: false; status: 401 | 403 };

export interface SenderPoolCheckUpdate {
  is_active: boolean;
  last_error: string | null;
  last_error_at: string | null;
}

export interface SenderPoolCheckDeps {
  authorize: (req: Request) => Promise<SenderPoolCheckAuthorization>;
  listActiveSenders: () => Promise<SenderPoolCheckRow[]>;
  sendCheck: (sender: SenderPoolCheckRow) => Promise<unknown>;
  updateSender: (id: string, update: SenderPoolCheckUpdate) => Promise<void>;
  reportError?: (error: unknown) => void;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function safeError(error: unknown): string {
  if (!(error instanceof Error)) return "smtp_check_failed";
  return error.message.slice(0, 500) || "smtp_check_failed";
}

export function createSenderPoolCheckHandler(deps: SenderPoolCheckDeps) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

    try {
      const authorization = await deps.authorize(req);
      if (!authorization.ok) {
        return json(
          { error: authorization.status === 401 ? "unauthorized" : "forbidden" },
          authorization.status,
        );
      }

      const rows = await deps.listActiveSenders();
      const results: Array<{ email: string; ok: boolean; error: string | null }> = [];

      for (const sender of rows) {
        if (!sender.app_password?.trim()) {
          results.push({ email: sender.email, ok: false, error: "missing_smtp_password" });
          continue;
        }

        let errorMessage: string | null = null;
        try {
          await deps.sendCheck(sender);
        } catch (error) {
          errorMessage = safeError(error);
          deps.reportError?.(error);
        }

        await deps.updateSender(sender.id, {
          is_active: errorMessage === null,
          last_error: errorMessage,
          last_error_at: errorMessage ? new Date().toISOString() : null,
        });
        results.push({ email: sender.email, ok: errorMessage === null, error: errorMessage });
      }

      return json({
        results,
        checked_count: results.length,
        ok_count: results.filter((result) => result.ok).length,
      }, 200);
    } catch (error) {
      deps.reportError?.(error);
      return json({ error: "internal_error" }, 500);
    }
  };
}
