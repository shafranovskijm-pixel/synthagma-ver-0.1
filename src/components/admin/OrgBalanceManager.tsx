import { useState } from "react";
import { Wallet, Plus, ArrowUpRight, ArrowDownRight} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { useOrgBalance } from "@/hooks/useOrgBalance";

interface OrgBalanceManagerProps {
  organizationId: string;
}

const typeLabels: Record<string, { label: string; icon: typeof ArrowUpRight; color: string }> = {
  topup: { label: "Пополнение", icon: ArrowUpRight, color: "text-green-600" },
  purchase: { label: "Покупка", icon: ArrowDownRight, color: "text-red-600" },
  refund: { label: "Возврат", icon: ArrowUpRight, color: "text-blue-600" } };

export function OrgBalanceManager({ organizationId }: OrgBalanceManagerProps) {
  const { balance, transactions, isLoading, topUpBalance } = useOrgBalance(organizationId);
  const [showTopUpDialog, setShowTopUpDialog] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState("");
  const [topUpDescription, setTopUpDescription] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const handleTopUp = async () => {
    const amount = parseFloat(topUpAmount);
    if (!amount || amount <= 0) return;
    setIsProcessing(true);
    const success = await topUpBalance(amount, topUpDescription);
    if (success) {
      setShowTopUpDialog(false);
      setTopUpAmount("");
      setTopUpDescription("");
    }
    setIsProcessing(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <SigmaSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Balance Card */}
      <Card className="bg-gradient-to-r from-primary/5 to-accent/5 border-primary/20">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wallet className="w-5 h-5 text-primary" />
              <CardTitle className="text-base">Баланс организации</CardTitle>
            </div>
            <Button size="sm" className="rounded-xl gap-1" onClick={() => setShowTopUpDialog(true)}>
              <Plus className="w-4 h-4" />Пополнить
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold font-display">{balance.toLocaleString()} ₽</p>
        </CardContent>
      </Card>

      {/* Transactions */}
      {transactions.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">История операций</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Тип</TableHead>
                  <TableHead>Сумма</TableHead>
                  <TableHead>Описание</TableHead>
                  <TableHead>Дата</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((tx) => {
                  const typeInfo = typeLabels[tx.type] || typeLabels.topup;
                  const Icon = typeInfo.icon;
                  return (
                    <TableRow key={tx.id}>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Icon className={`w-3.5 h-3.5 ${typeInfo.color}`} />
                          <span className="text-sm">{typeInfo.label}</span>
                        </div>
                      </TableCell>
                      <TableCell className={`font-semibold ${tx.amount > 0 ? "text-green-600" : "text-red-600"}`}>
                        {tx.amount > 0 ? "+" : ""}{tx.amount.toLocaleString()} ₽
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{tx.description || "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {format(new Date(tx.created_at), "dd.MM.yyyy HH:mm", { locale: ru })}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Top Up Dialog */}
      <Dialog open={showTopUpDialog} onOpenChange={setShowTopUpDialog}>
        <DialogContent className="rounded-2xl max-w-sm">
          <DialogHeader>
            <DialogTitle>Пополнить баланс</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Сумма (₽) *</Label>
              <Input
                type="number"
                value={topUpAmount}
                onChange={(e) => setTopUpAmount(e.target.value)}
                placeholder="10000"
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label>Комментарий</Label>
              <Textarea
                value={topUpDescription}
                onChange={(e) => setTopUpDescription(e.target.value)}
                placeholder="Причина пополнения..."
                className="rounded-xl"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              className="w-full btn-gradient rounded-xl"
              onClick={handleTopUp}
              disabled={isProcessing || !topUpAmount || parseFloat(topUpAmount) <= 0}
            >
              {isProcessing ? <><SigmaSpinner size="sm" className="mr-2" />Обработка...</> : "Пополнить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
