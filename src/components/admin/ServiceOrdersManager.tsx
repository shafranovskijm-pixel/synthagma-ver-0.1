import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Loader2, 
  Clock, 
  CheckCircle, 
  XCircle, 
  MessageSquare,
  Building2,
  Calendar,
  RefreshCw
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ServiceOrder {
  id: string;
  organization_id: string;
  service_id: string;
  service_title: string;
  service_price: string;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  organization?: {
    name: string;
    email: string;
  };
}

const statusLabels: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending: { label: 'Новая', color: 'bg-sigma-orange/10 text-sigma-orange', icon: <Clock className="w-3 h-3" /> },
  in_progress: { label: 'В работе', color: 'bg-primary/10 text-primary', icon: <RefreshCw className="w-3 h-3" /> },
  completed: { label: 'Выполнена', color: 'bg-sigma-green/10 text-sigma-green', icon: <CheckCircle className="w-3 h-3" /> },
  cancelled: { label: 'Отменена', color: 'bg-destructive/10 text-destructive', icon: <XCircle className="w-3 h-3" /> },
};

export function ServiceOrdersManager() {
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<ServiceOrder | null>(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('service_orders')
        .select(`
          *,
          organization:organizations(name, email)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrders(data || []);
    } catch (error: any) {
      console.error('Error fetching orders:', error);
      toast.error('Ошибка при загрузке заявок');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStatusChange = async (orderId: string, newStatus: string) => {
    setIsUpdatingStatus(true);
    try {
      const { error } = await supabase
        .from('service_orders')
        .update({ status: newStatus })
        .eq('id', orderId);

      if (error) throw error;

      setOrders(orders.map(o => 
        o.id === orderId ? { ...o, status: newStatus } : o
      ));
      
      if (selectedOrder?.id === orderId) {
        setSelectedOrder({ ...selectedOrder, status: newStatus });
      }
      
      toast.success('Статус обновлён');
    } catch (error: any) {
      console.error('Error updating status:', error);
      toast.error('Ошибка при обновлении статуса');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const filteredOrders = statusFilter === "all" 
    ? orders 
    : orders.filter(o => o.status === statusFilter);

  const pendingCount = orders.filter(o => o.status === 'pending').length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="text-2xl font-bold font-display">{orders.length}</div>
          <div className="text-sm text-muted-foreground">Всего заявок</div>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="text-2xl font-bold font-display text-sigma-orange">{pendingCount}</div>
          <div className="text-sm text-muted-foreground">Новых</div>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="text-2xl font-bold font-display text-primary">
            {orders.filter(o => o.status === 'in_progress').length}
          </div>
          <div className="text-sm text-muted-foreground">В работе</div>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="text-2xl font-bold font-display text-sigma-green">
            {orders.filter(o => o.status === 'completed').length}
          </div>
          <div className="text-sm text-muted-foreground">Выполнено</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48 rounded-xl">
            <SelectValue placeholder="Фильтр по статусу" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все статусы</SelectItem>
            <SelectItem value="pending">Новые</SelectItem>
            <SelectItem value="in_progress">В работе</SelectItem>
            <SelectItem value="completed">Выполненные</SelectItem>
            <SelectItem value="cancelled">Отменённые</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" className="rounded-xl gap-2" onClick={fetchOrders}>
          <RefreshCw className="w-4 h-4" />
          Обновить
        </Button>
      </div>

      {/* Orders List */}
      {filteredOrders.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>Нет заявок</p>
        </div>
      ) : (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Услуга</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Организация</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Цена</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Статус</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Дата</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Действия</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((order) => {
                const status = statusLabels[order.status] || statusLabels.pending;
                return (
                  <tr 
                    key={order.id} 
                    className="border-b border-border last:border-0 hover:bg-secondary/50 transition-colors cursor-pointer"
                    onClick={() => {
                      setSelectedOrder(order);
                      setShowDetailsDialog(true);
                    }}
                  >
                    <td className="px-6 py-4">
                      <div className="font-medium line-clamp-1">{order.service_title}</div>
                      {order.notes && (
                        <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                          <MessageSquare className="w-3 h-3" />
                          Есть комментарий
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm">{order.organization?.name || '—'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-medium text-primary">{order.service_price}</span>
                    </td>
                    <td className="px-6 py-4">
                      <Badge className={`${status.color} gap-1`}>
                        {status.icon}
                        {status.label}
                      </Badge>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Calendar className="w-3 h-3" />
                        {new Date(order.created_at).toLocaleDateString('ru-RU')}
                      </div>
                    </td>
                    <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                      <Select 
                        value={order.status} 
                        onValueChange={(v) => handleStatusChange(order.id, v)}
                        disabled={isUpdatingStatus}
                      >
                        <SelectTrigger className="w-32 rounded-lg h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Новая</SelectItem>
                          <SelectItem value="in_progress">В работе</SelectItem>
                          <SelectItem value="completed">Выполнена</SelectItem>
                          <SelectItem value="cancelled">Отменена</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Details Dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="rounded-2xl max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display">Детали заявки</DialogTitle>
            <DialogDescription>
              {selectedOrder?.service_title}
            </DialogDescription>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-secondary/50 rounded-xl p-3">
                  <div className="text-xs text-muted-foreground mb-1">Организация</div>
                  <div className="font-medium">{selectedOrder.organization?.name}</div>
                  <div className="text-sm text-muted-foreground">{selectedOrder.organization?.email}</div>
                </div>
                <div className="bg-secondary/50 rounded-xl p-3">
                  <div className="text-xs text-muted-foreground mb-1">Стоимость</div>
                  <div className="font-bold text-primary text-lg">{selectedOrder.service_price}</div>
                </div>
              </div>
              
              <div className="bg-secondary/50 rounded-xl p-3">
                <div className="text-xs text-muted-foreground mb-1">Статус</div>
                <Select 
                  value={selectedOrder.status} 
                  onValueChange={(v) => handleStatusChange(selectedOrder.id, v)}
                  disabled={isUpdatingStatus}
                >
                  <SelectTrigger className="w-full rounded-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Новая</SelectItem>
                    <SelectItem value="in_progress">В работе</SelectItem>
                    <SelectItem value="completed">Выполнена</SelectItem>
                    <SelectItem value="cancelled">Отменена</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {selectedOrder.notes && (
                <div className="bg-secondary/50 rounded-xl p-3">
                  <div className="text-xs text-muted-foreground mb-1">Комментарий клиента</div>
                  <div className="text-sm">{selectedOrder.notes}</div>
                </div>
              )}

              <div className="flex gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  Создана: {new Date(selectedOrder.created_at).toLocaleString('ru-RU')}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
