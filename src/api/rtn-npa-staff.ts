import { supabase } from "@/integrations/supabase/client";

export interface RtnNormativeQueueReceipt {
  run_id: string;
  status: "queued" | "running" | "completed";
  queued_at: string;
}

// This endpoint verifies the real caller and tenant on the server before it
// starts any service work. A queued receipt never proves normative currency.
export async function checkRtnNormativeBasis(organizationId: string, bankId: string): Promise<RtnNormativeQueueReceipt> {
  try {
    const { data, error } = await supabase.functions.invoke("rtn-npa-check", {
      body: { operation: "check", organizationId, bankId },
    });
    if (error) throw error;
    if (!data || typeof data !== "object" || Array.isArray(data)
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.run_id)
      || !["queued", "running", "completed"].includes(data.status)
      || typeof data.queued_at !== "string" || !Number.isFinite(Date.parse(data.queued_at))) {
      throw new Error("Сервер не подтвердил постановку проверки. Обновите состояние; повторная проверка не запускается автоматически.");
    }
    return { run_id: data.run_id, status: data.status, queued_at: data.queued_at };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Сервер не подтвердил")) throw error;
    throw new Error("Не удалось получить подтверждение проверки нормативных оснований. Обновите состояние: запрос мог уже попасть в очередь.");
  }
}
