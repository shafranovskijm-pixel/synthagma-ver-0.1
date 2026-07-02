import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  describeNovofonError,
  getConfiguredOperatorNumber,
  getConfiguredSipLogin,
  getConfiguredVirtualPhoneNumber,
  getNovofonEmployees,
  hasClassicApiCredentials,
  hasCallApiCredentials,
  normalizeNovofonPhone,
  novofonClassicRequest,
  novofonDataRpc,
  novofonRpc,
  NovofonApiError,
  resolveNovofonEmployee,
  startNovofonEmployeeCall,
} from "../_shared/novofon.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface StepResult {
  key: string;
  label: string;
  ok: boolean;
  message: string;
  details?: Record<string, unknown>;
}

interface VirtualNumber {
  virtual_phone_number?: string;
  status?: string;
  type?: string;
  scenarios?: unknown[];
}

interface EmployeeCallStartResponse {
  call_session_id?: number;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorDetails(error: unknown): Record<string, unknown> {
  if (error instanceof NovofonApiError) {
    return {
      code: error.code,
      mnemonic: error.mnemonic,
      status: error.status,
    };
  }
  return {};
}

function canUseClassicFallback() {
  return hasClassicApiCredentials();
}

function shouldFallbackToClassic(error: unknown) {
  return error instanceof NovofonApiError
    && ["access_token_invalid", "access_token_expired", "access_token_blocked", "auth_error", "component_disabled", "method_component_disabled"].includes(error.mnemonic || "");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) return json({ error: "auth required" }, 401);

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser();
    if (authErr || !user) return json({ error: "invalid auth" }, 401);

    const body = await req.json().catch(() => ({}));
    const testNumber = normalizeNovofonPhone(body?.test_number || "");
    const callerId = getConfiguredVirtualPhoneNumber();
    const operatorNumber = normalizeNovofonPhone(body?.operator_number || getConfiguredOperatorNumber(testNumber) || testNumber || "");
    const steps: StepResult[] = [];

    steps.push({
      key: "caller_id",
      label: "Купленный номер",
      ok: Boolean(callerId),
      message: callerId ? `Настроен номер ${callerId}` : "Не задан NOVOFON_CALLER_ID",
    });

    steps.push({
      key: "call_credentials",
      label: "Call API авторизация",
      ok: hasCallApiCredentials() || canUseClassicFallback(),
      message: hasCallApiCredentials()
        ? "Ключ/логин Novofon найден — сейчас проверим, принимает ли его Call API"
        : canUseClassicFallback()
          ? "Включён резервный Novofon callback по API Key + Secret"
          : "Нет Call API доступа или резервного API Key + Secret",
    });

    try {
      const employees = await getNovofonEmployees();
      const resolvedEmployee = await resolveNovofonEmployee(operatorNumber);
      steps.push({
        key: "employees",
        label: "Сотрудники АТС",
        ok: employees.length > 0 && Boolean(resolvedEmployee),
        message: resolvedEmployee
          ? `Найден employee_id ${resolvedEmployee.employee.id}: ${resolvedEmployee.reason}`
          : `Data API вернул сотрудников: ${employees.length}, но подходящий сотрудник для звонка не найден`,
        details: {
          total: employees.length,
          selected_employee_id: resolvedEmployee?.employee.id,
          selected_phone: resolvedEmployee?.phoneNumber,
        },
      });
    } catch (error) {
      steps.push({
        key: "employees",
        label: "Сотрудники АТС",
        ok: false,
        message: describeNovofonError(error),
        details: errorDetails(error),
      });
    }

    try {
      const virtualNumbers = await novofonDataRpc<VirtualNumber[]>("get.virtual_numbers", {
        limit: 100,
        fields: ["virtual_phone_number", "status", "type", "scenarios"],
      });
      const found = virtualNumbers.find((n) => normalizeNovofonPhone(n.virtual_phone_number || "") === callerId);
      steps.push({
        key: "virtual_number",
        label: "Номер в аккаунте Novofon",
        ok: Boolean(found),
        message: found
          ? `Номер ${callerId} найден, статус: ${found.status || "не указан"}`
          : `Номер ${callerId || "NOVOFON_CALLER_ID"} не найден в get.virtual_numbers`,
        details: { total: virtualNumbers.length, found_status: found?.status, found_type: found?.type },
      });
    } catch (error) {
      steps.push({
        key: "virtual_number",
        label: "Номер в аккаунте Novofon",
        ok: canUseClassicFallback(),
        message: describeNovofonError(error),
        details: { ...errorDetails(error), classic_fallback_enabled: canUseClassicFallback() },
      });
    }

    if (callerId && testNumber && operatorNumber) {
      try {
        const employeeCall = await startNovofonEmployeeCall<EmployeeCallStartResponse>({
          contact: testNumber,
          virtualPhoneNumber: callerId,
          operatorNumber,
          externalId: `diagnostic-${Date.now()}`,
        });
        steps.push({
          key: "test_call",
          label: "Тестовый звонок",
          ok: Boolean(employeeCall.data.call_session_id),
          message: employeeCall.data.call_session_id
            ? `Novofon принял команду start.employee_call, сессия ${employeeCall.data.call_session_id}`
            : "Novofon ответил на start.employee_call без call_session_id",
          details: {
            api: "employee_call",
            employee_id: employeeCall.employee.id,
            employee_phone: employeeCall.employeePhoneNumber,
          },
        });
      } catch (error) {
        try {
          await novofonRpc("start.simple_call", {
            first_call: "operator",
            switch_at_once: true,
            show_virtual_phone_number: true,
            virtual_phone_number: callerId,
            direction: "in",
            contact: testNumber,
            operator: operatorNumber,
            external_id: `diagnostic-${Date.now()}`,
          });
          steps.push({
            key: "test_call",
            label: "Тестовый звонок",
            ok: true,
            message: "Novofon принял команду start.simple_call",
          });
        } catch (simpleError) {
        if (canUseClassicFallback() && shouldFallbackToClassic(error)) {
          try {
            const classic = await novofonClassicRequest<{ status?: string; time?: number }>("GET", "/v1/request/callback/", {
              from: operatorNumber,
              to: testNumber,
              sip: getConfiguredSipLogin() || undefined,
            });
            steps.push({
              key: "test_call",
              label: "Тестовый звонок",
              ok: classic.status === "success",
              message: classic.status === "success"
                ? "Novofon принял команду через резервный callback API"
                : `Резервный callback API ответил: ${classic.status || "без статуса"}`,
              details: { api: "classic_callback", time: classic.time },
            });
          } catch (fallbackError) {
            steps.push({
              key: "test_call",
              label: "Тестовый звонок",
              ok: false,
              message: describeNovofonError(fallbackError),
              details: { ...errorDetails(fallbackError), primary_error: describeNovofonError(error) },
            });
          }
        } else {
          steps.push({
            key: "test_call",
            label: "Тестовый звонок",
            ok: false,
            message: describeNovofonError(simpleError),
            details: { ...errorDetails(simpleError), primary_error: describeNovofonError(error) },
          });
        }
        }
      }
    } else {
      steps.push({
        key: "test_call",
        label: "Тестовый звонок",
        ok: false,
        message: "Для проверки звонка нужен купленный номер, номер менеджера и тестовый номер",
      });
    }

    return json({
      ok: steps.every((s) => s.ok),
      caller_id: callerId || null,
      operator_number: operatorNumber || null,
      steps,
    });
  } catch (error) {
    return json({ ok: false, error: describeNovofonError(error), details: errorDetails(error) }, 500);
  }
});