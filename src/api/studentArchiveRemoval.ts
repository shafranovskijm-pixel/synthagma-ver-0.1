import { supabase } from "@/integrations/supabase/client";

export async function setArchivedStudentRemoved(organizationId: string, userId: string, removed: boolean): Promise<void> {
  if (!organizationId || !userId) throw new Error("Не указаны организация и ученик");
  const { data, error } = await supabase.rpc("set_archived_student_removed" as never, {
    p_organization_id: organizationId, p_user_id: userId, p_removed: removed,
  } as never);
  if (error) throw error;
  const result = data as { organization_id?: string; user_id?: string; removed?: boolean } | null;
  if (result?.organization_id !== organizationId || result.user_id !== userId || result.removed !== removed) {
    throw new Error("Сервер не подтвердил изменение архива");
  }
}
