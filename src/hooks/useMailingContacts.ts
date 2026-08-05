import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { ImportSummary, MappedContactRow } from "@/lib/mailing/contactsImport";

export interface MailingContact {
  id: string;
  organization_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  organization: string | null;
  position: string | null;
  city: string | null;
  custom_fields: Record<string, unknown> | null;
  status: string;
  source: string | null;
  created_at: string;
}

export function useMailingContacts(organizationId: string | null) {
  const [contacts, setContacts] = useState<MailingContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastImport, setLastImport] = useState<ImportSummary | null>(null);

  const refresh = useCallback(async () => {
    if (!organizationId) {
      setContacts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("mailing_contacts")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) toast.error("Не удалось загрузить базу: " + error.message);
    setContacts((data || []) as unknown as MailingContact[]);
    setLoading(false);
  }, [organizationId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /** Импорт идёт через SECURITY DEFINER RPC: дедупликация и отчёт считаются на сервере. */
  const importContacts = useCallback(
    async (rows: MappedContactRow[]): Promise<ImportSummary | null> => {
      if (!organizationId) {
        toast.error("Организация не определена");
        return null;
      }
      const { data, error } = await supabase.rpc("import_mailing_contacts", {
        p_organization_id: organizationId,
        p_rows: rows as unknown as never,
      });
      if (error) {
        toast.error("Ошибка импорта: " + error.message);
        return null;
      }
      const summary = data as unknown as ImportSummary;
      setLastImport(summary);
      toast.success(
        `Импорт завершён: добавлено ${summary.added}, дубликаты ${summary.duplicates}, ошибки ${summary.invalid}`,
      );
      await refresh();
      return summary;
    },
    [organizationId, refresh],
  );

  const removeContact = useCallback(async (id: string) => {
    const { error } = await supabase.from("mailing_contacts").delete().eq("id", id);
    if (error) {
      toast.error("Не удалось удалить контакт");
      return;
    }
    setContacts((prev) => prev.filter((c) => c.id !== id));
  }, []);

  return { contacts, loading, refresh, importContacts, removeContact, lastImport };
}
