import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface BalanceTransaction {
  id: string;
  organization_id: string;
  amount: number;
  type: string;
  description: string | null;
  related_order_id: string | null;
  performed_by: string | null;
  created_at: string;
}

const balanceKey = (orgId: string) => ["org", orgId, "balance"] as const;
const transactionsKey = (orgId: string) => ["org", orgId, "balance-transactions"] as const;

export function useOrgBalance(organizationId: string) {
  const qc = useQueryClient();

  const balanceQuery = useQuery({
    queryKey: balanceKey(organizationId),
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("balance")
        .eq("id", organizationId)
        .single();
      if (error) throw error;
      return Number(data?.balance) || 0;
    },
    staleTime: 60_000,
  });

  const transactionsQuery = useQuery({
    queryKey: transactionsKey(organizationId),
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("balance_transactions")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as BalanceTransaction[];
    },
    staleTime: 60_000,
  });

  const refresh = useCallback(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: balanceKey(organizationId) }),
      qc.invalidateQueries({ queryKey: transactionsKey(organizationId) }),
    ]);
  }, [qc, organizationId]);

  return {
    balance: balanceQuery.data ?? 0,
    transactions: transactionsQuery.data ?? [],
    isLoading: balanceQuery.isLoading || transactionsQuery.isLoading,
    refresh,
  };
}
