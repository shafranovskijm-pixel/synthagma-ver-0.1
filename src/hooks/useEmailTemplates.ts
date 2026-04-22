import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface EmailTemplate {
  id: string;
  scope: "platform" | "org";
  organization_id: string | null;
  name: string;
  category: string;
  subject: string;
  html_body: string;
  variables: any;
  is_default: boolean;
  deleted_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export const TEMPLATE_CATEGORIES = [
  { value: "cold", label: "Холодное знакомство" },
  { value: "followup", label: "Повторное касание" },
  { value: "presentation", label: "Приглашение на презентацию" },
  { value: "course_invite", label: "Приглашение на курс" },
  { value: "webinar_invite", label: "Приглашение на вебинар" },
  { value: "promo", label: "Промо / акции" },
  { value: "nurture", label: "Прогрев лида" },
  { value: "proposal", label: "Отправка КП" },
  { value: "contract", label: "Отправка договора" },
  { value: "reactivation", label: "Реактивация" },
  { value: "custom", label: "Произвольное" },
] as const;

export function useEmailTemplates(scope: "platform" | "org", organizationId: string | null) {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase
        .from("email_templates")
        .select("*")
        .is("deleted_at", null)
        .eq("scope", scope)
        .order("category", { ascending: true })
        .order("name", { ascending: true });
      if (scope === "org" && organizationId) q = q.eq("organization_id", organizationId);
      const { data, error } = await q;
      if (error) throw error;
      setTemplates((data || []) as EmailTemplate[]);
    } catch (e: any) {
      toast.error("Ошибка загрузки шаблонов: " + e.message);
    } finally {
      setLoading(false);
    }
  }, [scope, organizationId]);

  useEffect(() => { refresh(); }, [refresh]);

  const upsert = useCallback(async (input: Partial<EmailTemplate> & { name: string; subject: string; html_body: string; category: string }) => {
    const payload: any = {
      ...input,
      scope,
      organization_id: scope === "org" ? organizationId : null,
    };
    const { data, error } = await supabase
      .from("email_templates")
      .upsert(payload, { onConflict: "id" })
      .select("*")
      .single();
    if (error) { toast.error("Ошибка сохранения: " + error.message); return null; }
    toast.success("Шаблон сохранён");
    refresh();
    return data as EmailTemplate;
  }, [scope, organizationId, refresh]);

  const remove = useCallback(async (id: string) => {
    // soft delete
    const { error } = await supabase
      .from("email_templates")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) { toast.error("Ошибка удаления"); return; }
    toast.success("Шаблон удалён");
    setTemplates(prev => prev.filter(t => t.id !== id));
  }, []);

  const duplicate = useCallback(async (t: EmailTemplate) => {
    return upsert({
      name: t.name + " (копия)",
      subject: t.subject,
      html_body: t.html_body,
      category: t.category,
      variables: t.variables,
      is_default: false,
    });
  }, [upsert]);

  const cloneFromPlatform = useCallback(async (platformTemplate: EmailTemplate) => {
    if (scope !== "org" || !organizationId) {
      toast.error("Клонирование доступно только для организации");
      return null;
    }
    return upsert({
      name: platformTemplate.name,
      subject: platformTemplate.subject,
      html_body: platformTemplate.html_body,
      category: platformTemplate.category,
      variables: platformTemplate.variables,
      is_default: false,
    });
  }, [scope, organizationId, upsert]);

  const sendTest = useCallback(async (templateId: string, toEmail: string) => {
    const { data, error } = await supabase.functions.invoke("send-test-email", {
      body: {
        template_id: templateId,
        to_email: toEmail,
        scope,
        organization_id: scope === "org" ? organizationId : null,
      },
    });
    if (error) { toast.error("Не удалось отправить: " + error.message); return false; }
    if ((data as any)?.error) { toast.error((data as any).error); return false; }
    toast.success("Тестовое письмо отправлено на " + toEmail);
    return true;
  }, [scope, organizationId]);

  return { templates, loading, refresh, upsert, remove, duplicate, sendTest };
}
