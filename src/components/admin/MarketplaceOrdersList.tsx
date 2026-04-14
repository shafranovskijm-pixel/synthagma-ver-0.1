import { Eye, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

const statusLabels: Record<string, { label: string; color: string }> = {
  pending: { label: "Ожидает", color: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20" },
  approved: { label: "Одобрена", color: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  paid: { label: "Оплачена", color: "bg-green-500/10 text-green-600 border-green-500/20" },
  completed: { label: "Завершена", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  cancelled: { label: "Отменена", color: "bg-red-500/10 text-red-600 border-red-500/20" },
};

export { statusLabels };

interface Order {
  id: string;
  marketplace_course?: {
    id: string;
    course?: { id: string; title: string };
    organization?: { name: string } | null;
  };
  buyer_organization?: { name: string } | null;
  buyer_profile?: { full_name: string | null; email: string | null } | null;
  buyer_type: string;
  price: number;
  status: string;
  created_at: string;
  notes?: string | null;
}

interface MarketplaceOrdersListProps {
  orders: Order[];
  onViewOrder: (order: Order) => void;
}

export function MarketplaceOrdersList({ orders, onViewOrder }: MarketplaceOrdersListProps) {
  if (orders.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 text-center">
          <ShoppingCart className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
          <p className="text-muted-foreground">Заявок пока нет</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Курс</TableHead>
            <TableHead>Продавец</TableHead>
            <TableHead>Покупатель</TableHead>
            <TableHead>Сумма</TableHead>
            <TableHead>Статус</TableHead>
            <TableHead>Дата</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => (
            <TableRow key={order.id}>
              <TableCell className="font-medium">{order.marketplace_course?.course?.title || "—"}</TableCell>
              <TableCell className="text-muted-foreground">{order.marketplace_course?.organization?.name || "Платформа"}</TableCell>
              <TableCell>
                {order.buyer_organization ? order.buyer_organization.name : order.buyer_type === "student" ? (order.buyer_profile?.full_name || order.buyer_profile?.email || "Студент") : "—"}
              </TableCell>
              <TableCell className="font-semibold">{order.price.toLocaleString()} ₽</TableCell>
              <TableCell>
                <Badge className={statusLabels[order.status]?.color || ""}>
                  {statusLabels[order.status]?.label || order.status}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {format(new Date(order.created_at), "dd.MM.yyyy", { locale: ru })}
              </TableCell>
              <TableCell>
                <Button variant="ghost" size="sm" onClick={() => onViewOrder(order)}>
                  <Eye className="w-4 h-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
