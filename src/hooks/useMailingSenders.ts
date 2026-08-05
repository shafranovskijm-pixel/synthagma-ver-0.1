import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface MailingSender {
  id: string;
  organization_id: string;
  label: string;
  from_name: string | null;
  from_email: string;
  smtp_host: string;
  smtp_port: number;
  smtp_security: string;
  smtp_username: string;
  imap_host: string | null;
  imap_port: number | null;
  imap_security: string | null;
  imap_username: string | null;
  smtp_status: string;
  imap_status: string;
  last_tested_at: string | null;
  last_error: string | null;
  daily_limit: number;
  is_active: boolean;
}

/** Поля, которые разрешено читать клиенту. Пароль отсутствует намеренно. */
export const SENDER_PUBLIC_COLUMNS =
  "id, organization_id, label, from_name, from_email, smtp_host, smtp_port, smtp_security, smtp_username, imap_host, imap_port, imap_security, imap_username, smtp_status, imap_status, last_tested_at, last_error, daily_limit, is_active";

export interface SenderInput {
  id?: string;
  label: string;
  from_name?: string;
  from_email: string;
  smtp_host: string;
  smtp_port: number;
  smtp_security: string;
  smtp_username: string;
  /** Передаётся только на запись; шифруется триггером БД и назад не читается. */
  password?: string;
  imap_host?: string;
  imap_port?: number;
  imap_security?: string;
  imap_username?: string;
  daily_limit?: number;
}

/** Пресет без пароля (пароль вводит пользователь в мастере). */
export const TORGI_PRESET = {
  label: "torgi.com.ru",
  smtp_host: "mail.torgi.com.ru",
  smtp_port: 465,
  smtp_security: "ssl",
  imap_host: "mail.torgi.com.ru",
  imap_port: 993,
  imap_security: "ssl",
} as const;

export function useMailingSenders(organizationId: string | null) {
  const [senders, setSenders] = useState<MailingSender[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!organizationId) {
      setSenders([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("mailing_senders")
      .select(SENDER_PUBLIC_COLUMNS)
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: true });
    if (error) toast.error("Не удалось загрузить отправителей: " + error.message);
    setSenders((data || []) as unknown as MailingSender[]);
    setLoading(false);
  }, [organizationId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const save = useCallback(
    async (input: SenderInput) => {
      if (!organizationId) return false;
      setSaving(true);
      try {
        const payload: Record<string, unknown> = {
          organization_id: organizationId,
          label: input.label.trim(),
          from_name: input.from_name?.trim() || null,
          from_email: input.from_email.trim(),
          smtp_host: input.smtp_host.trim(),
          smtp_port: input.smtp_port,
          smtp_security: input.smtp_security,
          smtp_username: input.smtp_username.trim(),
          imap_host: input.imap_host?.trim() || null,
          imap_port: input.imap_port ?? null,
          imap_security: input.imap_security ?? null,
          imap_username: input.imap_username?.trim() || null,
          daily_limit: Math.max(1, Math.min(2000, input.daily_limit ?? 200)),
        };
        // Пароль пишем только если он введён; в ответе никогда не запрашиваем.
        if (input.password && input.password.trim()) {
          payload.password_encrypted = input.password;
          payload.smtp_status = "untested";
          payload.imap_status = "untested";
        }
        if (input.id) payload.id = input.id;

        const { error } = await supabase
          .from("mailing_senders")
          .upsert(payload as never, { onConflict: "id" });
        if (error) throw error;
        toast.success("Отправитель сохранён");
        await refresh();
        return true;
      } catch (e) {
        toast.error("Ошибка сохранения: " + (e as Error).message);
        return false;
      } finally {
        setSaving(false);
      }
    },
    [organizationId, refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("mailing_senders").delete().eq("id", id);
      if (error) {
        toast.error("Не удалось удалить отправителя");
        return;
      }
      await refresh();
    },
    [refresh],
  );

  /** Проверка соединения. Отправка писем не выполняется. */
  const testConnection = useCallback(
    async (id: string, protocol: "smtp" | "imap") => {
      setTestingId(id);
      try {
        const { data, error } = await supabase.functions.invoke("test-mailing-sender", {
          body: { senderId: id, protocol },
        });
        if (error) throw error;
        if ((data as { ok?: boolean })?.ok) toast.success(`${protocol.toUpperCase()}: соединение успешно`);
        else toast.error(`${protocol.toUpperCase()}: ${(data as { error?: string })?.error || "ошибка"}`);
      } catch (e) {
        toast.error("Проверка недоступна: " + (e as Error).message);
      } finally {
        setTestingId(null);
        await refresh();
      }
    },
    [refresh],
  );

  return { senders, loading, saving, testingId, refresh, save, remove, testConnection };
}
