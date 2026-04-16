import { useState, useEffect, useCallback } from "react";
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

export function useOrgBalance(organizationId: string) {
  const [balance, setBalance] = useState<number>(0);
  const [transactions, setTransactions] = useState<BalanceTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchBalance = useCallback(async () => {
    const { data, error } = await supabase
      .from("organizations")
      .select("balance")
      .eq("id", organizationId)
      .single();
    if (error) { console.error("Error fetching balance:", error); return; }
    setBalance(Number(data?.balance) || 0);
  }, [organizationId]);

  const fetchTransactions = useCallback(async () => {
    const { data, error } = await supabase
      .from("balance_transactions")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) { console.error("Error fetching transactions:", error); return; }
    setTransactions(data || []);
  }, [organizationId]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    await Promise.all([fetchBalance(), fetchTransactions()]);
    setIsLoading(false);
  }, [fetchBalance, fetchTransactions]);

  useEffect(() => {
    if (organizationId) loadData();
  }, [organizationId, loadData]);

  return { balance, transactions, isLoading, refresh: loadData };
}
