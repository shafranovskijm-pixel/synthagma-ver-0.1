import { Wallet, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { useOrgBalance } from "@/hooks/useOrgBalance";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

interface OrgBalanceManagerProps {
  organizationId: string;
}

const typeLabels: Record<string, { label: string; icon: typeof ArrowUpRight; color: string }> = {
  payment: { label: "Оплата курса", icon: ArrowUpRight, color: "text-green-600" },
  subscription: { label: "Подписка", icon: ArrowUpRight, color: "text-blue-600" },
  topup: { label: "Пополнение", icon: ArrowUpRight, color: "text-green-600" },
  purchase: { label: "Покупка", icon: ArrowDownRight, color: "text-red-600" },
  refund: { label: "Возврат", icon: ArrowUpRight, color: "text-blue-600" },
};

export function OrgBalanceManager({ organizationId }: OrgBalanceManagerProps) {
  const { balance, transactions, isLoading } = useOrgBalance(organizationId);

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
          <div className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-primary" />
            <CardTitle className="text-base">Баланс организации</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold font-display">{balance.toLocaleString()} ₽</p>
          <p className="text-xs text-muted-foreground mt-1">Формируется автоматически из подтверждённых платежей</p>
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
                  const typeInfo = typeLabels[tx.type] || typeLabels.payment;
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
    </div>
  );
}
