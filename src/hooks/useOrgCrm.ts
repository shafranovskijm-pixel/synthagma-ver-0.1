import { useLayoutEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  OrgCrmError, crmActivityArguments, crmError, crmSaveArguments, parseCrmSaveReceipt, parseOrgCrmSnapshot,
  type OrgCrmClientInput, type OrgCrmDealInput, type OrgCrmTaskInput, type OrgCrmActivityInput,
} from "@/lib/organization/orgCrm";

// Narrow boundary until the generated Supabase types include the additive CRM RPCs.
const rpc = (name: string, args: Record<string, unknown>) =>
  (supabase.rpc as unknown as (name: string, args: Record<string, unknown>) =>
    Promise<{ data: unknown; error: unknown | null }>)(name, args);

export function useOrgCrm(organizationId: string | null | undefined) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const queryClient = useQueryClient();
  const context = `${userId ?? ""}:${organizationId ?? ""}`;
  const active = useRef({ context, generation: 0, mounted: false });
  useLayoutEffect(() => {
    active.current = { context, generation: active.current.generation + 1, mounted: true };
    return () => { active.current.mounted = false; active.current.generation += 1; };
  }, [context]);

  const queryKey = ["org-crm", userId, organizationId] as const;
  const query = useQuery({
    queryKey, enabled: !!organizationId && !!userId, retry: false, staleTime: 0,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!organizationId || !userId) throw new OrgCrmError("Выберите организацию и войдите в аккаунт.", "CRM_NO_CONTEXT");
      try {
        const { data, error } = await rpc("org_crm_snapshot", { p_organization_id: organizationId });
        if (error) throw error;
        return parseOrgCrmSnapshot(data, organizationId);
      } catch (error) { throw crmError(error); }
    },
  });

  const beginMutation = () => {
    if (!organizationId || !userId || !active.current.mounted || active.current.context !== context) {
      throw new OrgCrmError("Кабинет изменился. Повторите действие в текущей организации.", "CRM_CONTEXT_CHANGED");
    }
    return active.current.generation;
  };
  const ensureCurrent = (generation: number) => {
    if (!active.current.mounted || active.current.context !== context || active.current.generation !== generation) {
      throw new OrgCrmError("Кабинет изменился. Обновите данные текущей организации.", "CRM_CONTEXT_CHANGED");
    }
  };
  const execute = async (name: string, args: Record<string, unknown>) => {
    const generation = beginMutation();
    try {
      const { data, error } = await rpc(name, args);
      ensureCurrent(generation);
      if (error) throw error;
      const receipt = parseCrmSaveReceipt(data);
      // The receipt confirms the write. A later read failure is displayed by the
      // query instead of inviting an accidental duplicate write.
      await queryClient.invalidateQueries({ queryKey, exact: true });
      ensureCurrent(generation);
      return receipt;
    } catch (error) {
      ensureCurrent(generation);
      const safeError = crmError(error);
      if (safeError.code === "CRM_ERROR") {
        throw new OrgCrmError("Не удалось подтвердить сохранение. Обновите CRM перед повторной попыткой.", "CRM_UNCONFIRMED_WRITE");
      }
      throw safeError;
    }
  };

  const saveClient = useMutation({ mutationFn: (input: OrgCrmClientInput) =>
    execute("org_crm_save_client", crmSaveArguments(organizationId ?? "", "client", input)), retry: false });
  const saveDeal = useMutation({ mutationFn: (input: OrgCrmDealInput) =>
    execute("org_crm_save_deal", crmSaveArguments(organizationId ?? "", "deal", input)), retry: false });
  const saveTask = useMutation({ mutationFn: (input: OrgCrmTaskInput) =>
    execute("org_crm_save_task", crmSaveArguments(organizationId ?? "", "task", input)), retry: false });
  const addActivity = useMutation({ mutationFn: (input: OrgCrmActivityInput) =>
    execute("org_crm_add_activity", crmActivityArguments(organizationId ?? "", input)), retry: false });

  return { data: query.data, isLoading: query.isPending && !!organizationId && !!userId,
    isFetching: query.isFetching, error: query.error, refetch: query.refetch,
    saveClient, saveDeal, saveTask, addActivity };
}
