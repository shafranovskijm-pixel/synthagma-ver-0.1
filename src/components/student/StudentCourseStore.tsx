import { useState, useEffect } from "react";
import {
  Store, Search, Clock, ShoppingCart, Loader2, CheckCircle2,
  Building2, Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface MarketplaceCourse {
  id: string;
  course_id: string;
  organization_id: string;
  price_student: number;
  description_short: string | null;
  preview_image_url: string | null;
  course?: {
    id: string;
    title: string;
    description?: string | null;
    duration?: string | null;
  };
  organization?: { name: string };
}

interface MarketplaceOrder {
  id: string;
  marketplace_course_id: string;
  status: string;
  price: number;
  notes: string | null;
  created_at: string;
  marketplace_course?: {
    course?: { title: string };
    organization?: { name: string };
  };
}

interface StudentCourseStoreProps {
  userId: string;
  organizationId: string;
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Ожидает", variant: "outline" },
  approved: { label: "Одобрена", variant: "default" },
  paid: { label: "Оплачена", variant: "default" },
  completed: { label: "Завершена", variant: "secondary" },
  cancelled: { label: "Отменена", variant: "destructive" },
};

export function StudentCourseStore({ userId, organizationId }: StudentCourseStoreProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [catalog, setCatalog] = useState<MarketplaceCourse[]>([]);
  const [orders, setOrders] = useState<MarketplaceOrder[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  // Order dialog
  const [selectedCourse, setSelectedCourse] = useState<MarketplaceCourse | null>(null);
  const [orderNotes, setOrderNotes] = useState("");
  const [isOrdering, setIsOrdering] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    fetchData();
  }, [organizationId]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      await Promise.all([fetchCatalog(), fetchOrders()]);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCatalog = async () => {
    const { data, error } = await supabase
      .from("marketplace_courses")
      .select(`
        *,
        course:courses(id, title, description, duration),
        organization:organizations(name)
      `)
      .eq("is_active", true);

    if (error) {
      console.error("Error fetching catalog:", error);
      return;
    }
    setCatalog(data || []);
  };

  const fetchOrders = async () => {
    const { data, error } = await supabase
      .from("marketplace_orders")
      .select(`
        *,
        marketplace_course:marketplace_courses(
          course:courses(title),
          organization:organizations(name)
        )
      `)
      .eq("buyer_user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching orders:", error);
      return;
    }
    setOrders(data || []);
  };

  const handleOrder = async () => {
    if (!selectedCourse) return;

    setIsOrdering(true);
    try {
      const { error } = await supabase.from("marketplace_orders").insert({
        marketplace_course_id: selectedCourse.id,
        buyer_user_id: userId,
        buyer_type: "student",
        price: selectedCourse.price_student,
        students_count: 1,
        notes: orderNotes || null,
        status: "pending",
      });

      if (error) throw error;

      // Notify seller
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("user_id", userId)
          .single();

        await supabase.functions.invoke("notify-course-order", {
          body: {
            orderId: "new",
            courseName: selectedCourse.course?.title || "Курс",
            buyerName: profile?.full_name || "Студент",
            buyerType: "student",
            studentsCount: 1,
            price: selectedCourse.price_student,
            sellerOrganizationId: selectedCourse.organization_id,
          },
        });
      } catch {
        // Non-critical
      }

      setSelectedCourse(null);
      setOrderNotes("");
      setShowSuccess(true);
      fetchOrders();
    } catch (error) {
      console.error("Order error:", error);
      toast.error("Ошибка при отправке заявки");
    } finally {
      setIsOrdering(false);
    }
  };

  const filteredCatalog = catalog.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.course?.title?.toLowerCase().includes(q) ||
      c.organization?.name?.toLowerCase().includes(q) ||
      c.description_short?.toLowerCase().includes(q)
    );
  });

  const formatPrice = (price: number) =>
    new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(price);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-6 border border-primary/10">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Store className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Магазин курсов</h2>
            <p className="text-sm text-muted-foreground">Найдите и приобретите новые курсы</p>
          </div>
        </div>
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Поиск по названию, организации..."
            className="pl-10 rounded-xl"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Catalog Grid */}
      {filteredCatalog.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Store className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Курсы пока не найдены</p>
          <p className="text-sm">Попробуйте изменить поисковый запрос</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCatalog.map((item) => (
            <Card key={item.id} className="flex flex-col hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <h3 className="font-semibold text-base leading-tight line-clamp-2">
                  {item.course?.title}
                </h3>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                  <Building2 className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{item.organization?.name || "Организация"}</span>
                </div>
              </CardHeader>
              <CardContent className="flex-1 pb-3">
                {(item.description_short || item.course?.description) && (
                  <p className="text-sm text-muted-foreground line-clamp-3 mb-3">
                    {item.description_short || item.course?.description}
                  </p>
                )}
                {item.course?.duration && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="w-3.5 h-3.5" />
                    {item.course.duration}
                  </div>
                )}
              </CardContent>
              <CardFooter className="pt-0 flex items-center justify-between border-t border-border pt-4">
                <span className="text-lg font-bold text-primary">
                  {formatPrice(item.price_student)}
                </span>
                <Button
                  size="sm"
                  className="rounded-xl gap-1.5"
                  onClick={() => setSelectedCourse(item)}
                >
                  <ShoppingCart className="w-4 h-4" />
                  Оставить заявку
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {/* My Orders */}
      {orders.length > 0 && (
        <div>
          <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-muted-foreground" />
            Мои заявки
          </h3>
          <div className="space-y-2">
            {orders.map((order) => {
              const mc = order.marketplace_course as any;
              const cfg = statusConfig[order.status] || statusConfig.pending;
              return (
                <div
                  key={order.id}
                  className="flex items-center justify-between p-3 rounded-xl border bg-card"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">
                      {mc?.course?.title || "Курс"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {mc?.organization?.name} · {format(new Date(order.created_at), "d MMM yyyy", { locale: ru })}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-medium">{formatPrice(order.price)}</span>
                    <Badge variant={cfg.variant}>{cfg.label}</Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Order Dialog */}
      <Dialog open={!!selectedCourse} onOpenChange={(open) => !open && setSelectedCourse(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Оставить заявку</DialogTitle>
            <DialogDescription>
              Заявка будет отправлена организации-продавцу для рассмотрения
            </DialogDescription>
          </DialogHeader>
          {selectedCourse && (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-secondary">
                <p className="font-medium text-sm">{selectedCourse.course?.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {selectedCourse.organization?.name}
                </p>
                <p className="text-primary font-bold mt-2">
                  {formatPrice(selectedCourse.price_student)}
                </p>
              </div>
              <div className="space-y-2">
                <Label>Комментарий (необязательно)</Label>
                <Textarea
                  placeholder="Дополнительная информация к заявке..."
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedCourse(null)}>
              Отмена
            </Button>
            <Button onClick={handleOrder} disabled={isOrdering} className="gap-2">
              {isOrdering ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Отправить заявку
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Success Dialog */}
      <Dialog open={showSuccess} onOpenChange={setShowSuccess}>
        <DialogContent className="sm:max-w-sm text-center">
          <div className="flex flex-col items-center py-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <CheckCircle2 className="w-8 h-8 text-primary" />
            </div>
            <DialogTitle className="text-lg">Заявка отправлена!</DialogTitle>
            <DialogDescription className="mt-2">
              Организация-продавец рассмотрит вашу заявку и свяжется с вами
            </DialogDescription>
          </div>
          <DialogFooter className="sm:justify-center">
            <Button onClick={() => setShowSuccess(false)} className="rounded-xl">
              Понятно
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
