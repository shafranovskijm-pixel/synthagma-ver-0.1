import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type DSRType = "access" | "deletion" | "withdrawal" | "correction";
export type DSRStatus = "pending" | "in_progress" | "resolved" | "rejected";

export interface DataSubjectRequest {
  id: string;
  user_id: string;
  organization_id: string;
  request_type: DSRType;
  status: DSRStatus;
  description: string | null;
  contact_email: string | null;
  attachment_urls: string[] | null;
  response: string | null;
  due_date: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
  updated_at: string;
}

export const DSR_TYPE_LABELS: Record<DSRType, string> = {
  access: "Получить копию данных",
  deletion: "Удалить персональные данные",
  withdrawal: "Отозвать согласие на обработку",
  correction: "Исправить данные",
};

export const DSR_STATUS_LABELS: Record<DSRStatus, string> = {
  pending: "Новый",
  in_progress: "В работе",
  resolved: "Выполнен",
  rejected: "Отклонён",
};

export const DSR_STATUS_COLORS: Record<DSRStatus, string> = {
  pending: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  in_progress: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30",
  resolved: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  rejected: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30",
};

/** Хук для ученика — список своих запросов + создание нового. */
export function useMyDataSubjectRequests(userId: string | null) {
  const [requests, setRequests] = useState<DataSubjectRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("data_subject_requests")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Не удалось загрузить запросы");
    } else {
      setRequests((data || []) as DataSubjectRequest[]);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const create = async (
    organizationId: string,
    requestType: DSRType,
    description: string,
    contactEmail: string,
  ) => {
    if (!userId) return false;
    setSubmitting(true);
    const due = new Date();
    due.setDate(due.getDate() + 30);
    const { error } = await supabase.from("data_subject_requests").insert({
      user_id: userId,
      organization_id: organizationId,
      request_type: requestType,
      description: description || null,
      contact_email: contactEmail || null,
      due_date: due.toISOString().slice(0, 10),
    });
    setSubmitting(false);
    if (error) {
      toast.error("Не удалось отправить запрос: " + error.message);
      return false;
    }
    toast.success("Запрос отправлен. Ответ придёт в течение 30 дней (152-ФЗ).");
    await load();
    return true;
  };

  return { requests, loading, submitting, create, reload: load };
}

/** Хук для организации — список всех запросов с обработкой. */
export function useOrgDataSubjectRequests(organizationId: string | null) {
  const [requests, setRequests] = useState<DataSubjectRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<DSRStatus | "all">("all");

  const load = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("data_subject_requests")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Не удалось загрузить запросы");
    } else {
      setRequests((data || []) as DataSubjectRequest[]);
    }
    setLoading(false);
  }, [organizationId]);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (id: string, status: DSRStatus, response?: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    const update: Record<string, unknown> = { status };
    if (response !== undefined) update.response = response;
    if (status === "resolved" || status === "rejected") {
      update.resolved_at = new Date().toISOString();
      update.resolved_by = user?.id ?? null;
    }
    const { error } = await supabase.from("data_subject_requests").update(update).eq("id", id);
    if (error) {
      toast.error("Не удалось обновить статус");
      return false;
    }
    toast.success("Статус обновлён");
    await load();
    return true;
  };

  const filtered = filter === "all" ? requests : requests.filter(r => r.status === filter);
  const counts = {
    all: requests.length,
    pending: requests.filter(r => r.status === "pending").length,
    in_progress: requests.filter(r => r.status === "in_progress").length,
    resolved: requests.filter(r => r.status === "resolved").length,
    rejected: requests.filter(r => r.status === "rejected").length,
  };

  return { requests: filtered, loading, filter, setFilter, counts, updateStatus, reload: load };
}
