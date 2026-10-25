import {requireTelephonyActor,requireVisibleTelephonyLead,telephonyProviderMessage} from "../_shared/telephony-authorization.ts";
import {accessErrorResponse,AccessError} from "../_shared/privileged-access.ts";
import {readProviderOperationObject} from "../_shared/provider-operation-access.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getConfiguredOperatorNumber,
  getConfiguredSipLogin,
  getConfiguredVirtualPhoneNumber,
  hasClassicApiCredentials,
  hasCallApiCredentials,
  normalizeNovofonPhone,
  NovofonApiError,
  novofonClassicRequest,
  novofonRpc,
  startNovofonEmployeeCall,
} from "../_shared/novofon.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CallStartResponse {
  call_session_id?: number;
}

interface EmployeeCallStartResponse extends CallStartResponse {}

interface ClassicCallbackResponse {
  status?: string;
  from?: string | number;
  to?: string | number;
  time?: number;
}

function canUseClassicFallback() {
  return hasClassicApiCredentials();
}

function shouldFallbackToClassic(error: unknown) {
  return error instanceof NovofonApiError
    && [
      "access_token_invalid",
      "access_token_expired",
      "access_token_blocked",
      "auth_error",
      "component_disabled",
      "method_component_disabled",
    ].includes(error.mnemonic || "");
}

async function startClassicCallback(operator: string, to: string, fromSip?: string): Promise<ClassicCallbackResponse> {
  return await novofonClassicRequest<ClassicCallbackResponse>("GET", "/v1/request/callback/", {
    from: operator,
    to,
    ...(fromSip ? { sip: fromSip } : {}),
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const actor = await requireTelephonyActor(req, admin, header => createClient(
      Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {global:{headers:{Authorization:header}},auth:{autoRefreshToken:false,persistSession:false}},
    ), true);
    const user = {id:actor.userId};

    const body = await readProviderOperationObject(req);
    const { to_number, lead_id, from_sip, operator_number, is_test } = body;
    const lead = await requireVisibleTelephonyLead(actor, lead_id);
    const company_inn = lead?.inn ?? (typeof body.company_inn === 'string' ? body.company_inn.slice(0,12) : null);
    const company_name = lead?.org_name ?? (typeof body.company_name === 'string' ? body.company_name.slice(0,256) : null);
    if (typeof to_number !== "string" || !to_number.trim() || to_number.length > 64 || (from_sip != null && (typeof from_sip !== "string" || from_sip.length > 128)) || (operator_number != null && (typeof operator_number !== "string" || operator_number.length > 64))) {
      return new Response(JSON.stringify({ error: "to_number required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerId = getConfiguredVirtualPhoneNumber();
    if (!callerId) {
      return new Response(JSON.stringify({ error: "NOVOFON_CALLER_ID not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const to = normalizeNovofonPhone(to_number);
    if (to.length < 7 || to.length > 15) return accessErrorResponse(new AccessError(400, "Некорректный номер телефона"), corsHeaders);
    const operator = normalizeNovofonPhone(operator_number || from_sip || getConfiguredOperatorNumber());
    if (!operator) {
      return new Response(JSON.stringify({
        ok: false,
        error: "NOVOFON_OPERATOR_NUMBER not configured",
        message: "Не задан номер менеджера. Для теста и звонков нужен NOVOFON_OPERATOR_NUMBER или operator_number.",
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (to === callerId) {
      return new Response(JSON.stringify({
        ok: false,
        error: "own_virtual_phone_number_not_allowed",
        message: "Нельзя тестировать звонок на сам купленный виртуальный номер. Укажите личный мобильный менеджера.",
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let nfRes: CallStartResponse | ClassicCallbackResponse;
    let providerCallId: string | null = null;
    let usedApi: "call_api" | "employee_call" | "classic_callback" = "employee_call";
    let employeeInfo: Record<string, unknown> | null = null;
    const ringTestNumberDirectly = Boolean(is_test && operator === to);

    // Официальная документация Novofon рекомендует /v1/request/callback/ —
    // Novofon сначала звонит менеджеру (from), после ответа соединяет с клиентом (to).
    // Это самый надёжный сценарий, поэтому он используется по умолчанию.
    if (canUseClassicFallback()) {
      try {
        usedApi = "classic_callback";
        nfRes = await startClassicCallback(operator, to, from_sip || getConfiguredSipLogin() || undefined);
        providerCallId = (nfRes as ClassicCallbackResponse).time ? String((nfRes as ClassicCallbackResponse).time) : null;
      } catch (classicError) {
        if (!hasCallApiCredentials()) throw classicError;
        console.warn("telephony_classic_fallback", {code:"provider_failed"});
        usedApi = "call_api";
        nfRes = await novofonRpc<CallStartResponse>("start.simple_call", {
          first_call: "operator",
          switch_at_once: true,
          show_virtual_phone_number: true,
          virtual_phone_number: callerId,
          direction: "in",
          contact: to,
          operator,
          external_id: lead_id || `test-${Date.now()}`,
        });
        providerCallId = nfRes.call_session_id ? String(nfRes.call_session_id) : null;
      }
    } else if (hasCallApiCredentials()) {
      try {
        if (ringTestNumberDirectly) {
          usedApi = "call_api";
          nfRes = await novofonRpc<CallStartResponse>("start.simple_call", {
            first_call: "operator",
            switch_at_once: true,
            show_virtual_phone_number: true,
            virtual_phone_number: callerId,
            direction: "in",
            contact: to,
            operator,
            external_id: lead_id || `test-${Date.now()}`,
          });
          providerCallId = nfRes.call_session_id ? String(nfRes.call_session_id) : null;
        } else {
          const employeeCall = await startNovofonEmployeeCall<EmployeeCallStartResponse>({
            contact: to,
            virtualPhoneNumber: callerId,
            operatorNumber: operator,
            externalId: lead_id || `test-${Date.now()}`,
          });
          usedApi = "employee_call";
          nfRes = employeeCall.data;
          providerCallId = employeeCall.data.call_session_id ? String(employeeCall.data.call_session_id) : null;
          employeeInfo = {
            id: employeeCall.employee.id,
            full_name: employeeCall.employee.full_name,
            phone_number: employeeCall.employeePhoneNumber,
          };
        }
      } catch (error) {
        usedApi = "call_api";
        nfRes = await novofonRpc<CallStartResponse>("start.simple_call", {
          first_call: "operator",
          switch_at_once: true,
          show_virtual_phone_number: true,
          virtual_phone_number: callerId,
          direction: "in",
          contact: to,
          operator,
          external_id: lead_id || `test-${Date.now()}`,
        });
        providerCallId = nfRes.call_session_id ? String(nfRes.call_session_id) : null;
      }
    } else {
      return new Response(JSON.stringify({
        ok: false,
        error: "call_api_credentials_missing",
        message: "Не задан NOVOFON_API_KEY/NOVOFON_API_SECRET (Classic API) и нет Call API токена.",
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }



    const { data: log, error: logErr } = await admin
      .from("call_logs")
      .insert({
        manager_user_id: user.id,
        direction: "outbound",
        from_number: operator,
        to_number: to,
        company_inn: company_inn ?? null,
        company_name: company_name ?? null,
        lead_id: lead_id ?? null,
        status: "dialing",
        provider: "novofon",
        novofon_call_id: providerCallId,
        notes: is_test ? '__test_call__' : null,
      })
      .select("id")
      .single();

    if (logErr) console.error("telephony_call_log_write_failed", {code:"database_failed"});

    const ok = usedApi === "classic_callback" ? nfRes.status === "success" : Boolean((nfRes as CallStartResponse).call_session_id);
    return new Response(
      JSON.stringify({
        ok,
        api: usedApi,
        novofon: ok ? nfRes : {message:telephonyProviderMessage(null)},
        employee: employeeInfo,
        call_log_id: log?.id ?? null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return accessErrorResponse(e, corsHeaders);
  }
});
