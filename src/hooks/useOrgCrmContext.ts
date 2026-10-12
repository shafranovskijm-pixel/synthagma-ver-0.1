import { useLayoutEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { OrgCrmError, crmActivityArguments, crmError, crmSaveArguments, parseCrmSaveReceipt,
  type OrgCrmDealInput, type OrgCrmTaskInput, type OrgCrmActivityInput } from "@/lib/organization/orgCrm";
import { crmContextArguments, crmLinkArguments, parseOrgCrmContext, type OrgCrmEntityType } from "@/lib/organization/orgCrmContext";

const rpc = (name: string, args: Record<string, unknown>) =>
  (supabase.rpc as unknown as (name: string, args: Record<string, unknown>) =>
    Promise<{ data: unknown; error: unknown | null }>)(name, args);

export function useOrgCrmContext(organizationId: string, entityType: OrgCrmEntityType, entityId: string) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const queryClient = useQueryClient();
  const context = `${userId ?? ""}:${organizationId}:${entityType}:${entityId}`;
  const active = useRef({ context, generation: 0, mounted: false });
  useLayoutEffect(() => {
    active.current = { context, generation: active.current.generation + 1, mounted: true };
    return () => { active.current.mounted = false; active.current.generation += 1; };
  }, [context]);
  const queryKey = ["org-crm-context", userId, organizationId, entityType, entityId] as const;
  const query = useQuery({ queryKey, enabled: !!userId && !!organizationId && !!entityId,
    retry: false, staleTime: 0, refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!userId) throw new OrgCrmError("Войдите в аккаунт.", "CRM_NO_CONTEXT");
      try {
        const { data, error } = await rpc("org_crm_context", crmContextArguments(organizationId, entityType, entityId));
        if (error) throw error;
        return parseOrgCrmContext(data, organizationId, entityType, entityId);
      } catch (error) { throw crmError(error); }
    },
  });
  const ensureCurrent = (generation: number) => {
    if (!userId || !active.current.mounted || active.current.context !== context || active.current.generation !== generation) {
      throw new OrgCrmError("Карточка изменилась. Обновите данные текущей карточки.", "CRM_CONTEXT_CHANGED");
    }
  };
  const execute = async (name: string, args: Record<string, unknown>) => {
    const generation = active.current.generation;
    ensureCurrent(generation);
    try {
      const { data, error } = await rpc(name, args);
      ensureCurrent(generation);
      if (error) throw error;
      const receipt = parseCrmSaveReceipt(data);
      // A confirmed write remains confirmed even if a subsequent read fails.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["org-crm-context", userId, organizationId] }),
        queryClient.invalidateQueries({ queryKey: ["org-crm", userId, organizationId], exact: true }),
      ]);
      ensureCurrent(generation);
      return receipt;
    } catch (error) {
      ensureCurrent(generation);
      const safe = crmError(error);
      if (safe.code === "CRM_ERROR") throw new OrgCrmError("Не удалось подтвердить сохранение. Обновите карточку перед повторной попыткой.", "CRM_UNCONFIRMED_WRITE");
      throw safe;
    }
  };
  const requireClient = (clientId: string) => {
    if (query.error || !query.data?.client || query.data.client.id !== clientId) {
      throw new OrgCrmError("Обновите данные и выберите клиента этой карточки.", "CRM_CONTEXT_CHANGED");
    }
  };
  const linkClient = useMutation({ mutationFn: (clientId: string | null) =>
    execute("org_crm_link_subject", crmLinkArguments(organizationId, entityType, entityId, clientId)), retry: false });
  const saveDeal = useMutation({ mutationFn: (input: OrgCrmDealInput) => { requireClient(input.client_id);
    return execute("org_crm_save_deal", crmSaveArguments(organizationId, "deal", input)); }, retry: false });
  const saveTask = useMutation({ mutationFn: (input: OrgCrmTaskInput) => { requireClient(input.client_id);
    return execute("org_crm_save_task", crmSaveArguments(organizationId, "task", input)); }, retry: false });
  const addActivity = useMutation({ mutationFn: (input: OrgCrmActivityInput) => { requireClient(input.client_id);
    return execute("org_crm_add_activity", crmActivityArguments(organizationId, input)); }, retry: false });
  return { data: query.data, isLoading: query.isPending && !!userId && !!organizationId && !!entityId,
    isFetching: query.isFetching, error: query.error, refetch: query.refetch, linkClient, saveDeal, saveTask, addActivity };
}
