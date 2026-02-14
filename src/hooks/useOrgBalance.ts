import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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

  const topUpBalance = async (amount: number, description: string) => {
    if (amount <= 0) { toast.error("Сумма должна быть положительной"); return false; }
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Insert transaction
      const { error: txError } = await supabase.from("balance_transactions").insert({
        organization_id: organizationId,
        amount,
        type: "topup",
        description: description || "Пополнение баланса",
        performed_by: user?.id || null,
      });
      if (txError) throw txError;

      // Update balance
      const { error: updateError } = await supabase
        .from("organizations")
        .update({ balance: balance + amount })
        .eq("id", organizationId);
      if (updateError) throw updateError;

      toast.success(`Баланс пополнен на ${amount.toLocaleString()} ₽`);
      await loadData();
      return true;
    } catch (error) {
      console.error("Error topping up balance:", error);
      toast.error("Ошибка при пополнении баланса");
      return false;
    }
  };

  const deductBalance = async (amount: number, description: string, orderId?: string) => {
    if (amount <= 0) { toast.error("Сумма должна быть положительной"); return false; }
    if (balance < amount) { toast.error("Недостаточно средств на балансе"); return false; }
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error: txError } = await supabase.from("balance_transactions").insert({
        organization_id: organizationId,
        amount: -amount,
        type: "purchase",
        description,
        related_order_id: orderId || null,
        performed_by: user?.id || null,
      });
      if (txError) throw txError;

      const { error: updateError } = await supabase
        .from("organizations")
        .update({ balance: balance - amount })
        .eq("id", organizationId);
      if (updateError) throw updateError;

      await loadData();
      return true;
    } catch (error) {
      console.error("Error deducting balance:", error);
      toast.error("Ошибка при списании");
      return false;
    }
  };

  return { balance, transactions, isLoading, topUpBalance, deductBalance, refresh: loadData };
}
