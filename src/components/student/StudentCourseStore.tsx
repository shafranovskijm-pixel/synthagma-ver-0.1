import { useState, useEffect, useMemo } from "react";
import {
  Store, Search, Clock, ShoppingCart, Loader2, CheckCircle2,
  Building2, Send, FileText, Video, ClipboardList, Presentation,
  Headphones, BookOpen, Eye, Gift, Zap, Award,
  Factory, Flame, Droplets, HardHat, Leaf, ChevronDown,
  GraduationCap, ShieldCheck, Wrench,
} from "lucide-react";
import { MARKETPLACE_ORG_ID } from "@/constants/marketplace";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";

import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { safeInvoke } from "@/utils/safeInvoke";
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
    cover_image_url?: string | null;
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

interface PreviewLesson {
  id: string;
  title: string;
  type: string;
  order_index: number;
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

const lessonTypeIcon: Record<string, { icon: React.ElementType; label: string }> = {
  text: { icon: FileText, label: "Лекция" },
  video: { icon: Video, label: "Видео" },
  test: { icon: ClipboardList, label: "Тест" },
  slider: { icon: Presentation, label: "Презентация" },
  audio: { icon: Headphones, label: "Аудио" },
};

export function StudentCourseStore({ userId, organizationId }: StudentCourseStoreProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [catalog, setCatalog] = useState<MarketplaceCourse[]>([]);
  const [orders, setOrders] = useState<MarketplaceOrder[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [dbCategories, setDbCategories] = useState<{ id: string; name: string; order_index: number | null; parent_type: string | null }[]>([]);

  // Preview
  const [previewCourse, setPreviewCourse] = useState<MarketplaceCourse | null>(null);
  const [previewLessons, setPreviewLessons] = useState<PreviewLesson[]>([]);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  // Order dialog
  const [selectedCourse, setSelectedCourse] = useState<MarketplaceCourse | null>(null);
  const [orderNotes, setOrderNotes] = useState("");
  const [isOrdering, setIsOrdering] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    fetchData();
  }, [organizationId]);

  const fetchDbCategories = async () => {
    const { data, error } = await supabase
      .from("course_categories")
      .select("id, name, order_index, parent_type")
      .eq("organization_id", MARKETPLACE_ORG_ID)
      .order("order_index", { ascending: true });
    if (error) { console.error("Error fetching categories:", error); return; }
    setDbCategories(data || []);
  };

  const fetchData = async () => {
    setIsLoading(true);
    try {
      await Promise.all([fetchCatalog(), fetchOrders(), fetchDbCategories()]);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCatalog = async () => {
    const { data, error } = await supabase
      .from("marketplace_courses")
      .select(`
        *,
        course:courses(id, title, description, duration, category_id, cover_image_url),
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

  const openPreview = async (item: MarketplaceCourse) => {
    setPreviewCourse(item);
    setPreviewLessons([]);
    if (!item.course?.id) return;

    setIsLoadingPreview(true);
    try {
      const { data, error } = await supabase
        .from("lessons")
        .select("id, title, type, order_index")
        .eq("course_id", item.course.id)
        .order("order_index", { ascending: true });

      if (!error && data) {
        setPreviewLessons(data);
      }
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleOrderFromPreview = () => {
    if (previewCourse) {
      setSelectedCourse(previewCourse);
      setPreviewCourse(null);
    }
  };

  const handleOrder = async () => {
    if (!selectedCourse) return;

    setIsOrdering(true);
    try {
      const { data: orderData, error } = await supabase.from("marketplace_orders").insert({
        marketplace_course_id: selectedCourse.id,
        buyer_user_id: userId,
        buyer_type: "student",
        price: selectedCourse.price_student,
        students_count: 1,
        notes: orderNotes || null,
        status: "pending",
      }).select("id").single();

      if (error) throw error;

      // Create org notification for seller
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, email")
          .eq("user_id", userId)
          .single();

        const studentName = profile?.full_name || "Студент";
        const studentEmail = profile?.email || "";
        const courseName = selectedCourse.course?.title || "Курс";
        const price = selectedCourse.price_student;

        await supabase.from("org_notifications").insert({
          type: "order",
          title: `Новый заказ: ${courseName}`,
          message: `${studentName} (${studentEmail}) оформил заказ на курс "${courseName}" — ${price} ₽`,
          organization_id: selectedCourse.organization_id,
          related_id: orderData?.id || null,
        });

        await safeInvoke("notify-course-order", {
          body: {
            orderId: orderData?.id || "new",
            courseName,
            buyerName: studentName,
            buyerType: "student",
            studentsCount: 1,
            price,
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


  const groupedCatalog = useMemo(() => {
    // Group by DB category_id
    const byCatId = new Map<string, MarketplaceCourse[]>();
    const uncategorized: MarketplaceCourse[] = [];
    for (const c of filteredCatalog) {
      const catId = (c.course as any)?.category_id;
      if (catId) {
        if (!byCatId.has(catId)) byCatId.set(catId, []);
        byCatId.get(catId)!.push(c);
      } else {
        uncategorized.push(c);
      }
    }

    const programTypes = [
      { category: "Повышение квалификации", badge: "ДПО" },
      { category: "Профессиональная переподготовка", badge: "ДПО" },
      { category: "Охрана труда / Пожарная безопасность", badge: "ОТ / ПБ" },
      { category: "Рабочие профессии", badge: "ПО" },
    ];

    return programTypes.map(pt => {
      const ptCategories = dbCategories.filter(
        cat => (cat.parent_type || "Повышение квалификации") === pt.category
      );
      const subGroups = ptCategories.map(cat => ({
        category: cat.name,
        courses: byCatId.get(cat.id) || [],
      }));
      const courses = subGroups.flatMap(g => g.courses);
      if (pt.category === "Повышение квалификации") {
        courses.push(...uncategorized);
      }
      return { ...pt, courses, subGroups };
    });
  }, [filteredCatalog, dbCategories]);

  const programTypeMetaStudent: Record<string, { icon: React.ElementType; color: string; bgColor: string }> = {
    "Повышение квалификации": { icon: GraduationCap, color: "text-blue-600", bgColor: "bg-blue-500/10" },
    "Профессиональная переподготовка": { icon: Award, color: "text-violet-600", bgColor: "bg-violet-500/10" },
    "Охрана труда / Пожарная безопасность": { icon: ShieldCheck, color: "text-amber-600", bgColor: "bg-amber-500/10" },
    "Рабочие профессии": { icon: Wrench, color: "text-emerald-600", bgColor: "bg-emerald-500/10" },
  };

  const subCategoryMetaStudent: Record<string, { icon: React.ElementType; color: string; bgColor: string }> = {
    "Промышленная безопасность": { icon: Factory, color: "text-orange-500", bgColor: "bg-orange-500/10" },
    "Электробезопасность": { icon: Zap, color: "text-yellow-500", bgColor: "bg-yellow-500/10" },
    "Энергетика": { icon: Flame, color: "text-red-500", bgColor: "bg-red-500/10" },
    "Экологическая безопасность": { icon: Leaf, color: "text-green-500", bgColor: "bg-green-500/10" },
    "Гидротехнические сооружения": { icon: Droplets, color: "text-blue-500", bgColor: "bg-blue-500/10" },
    "Строительный контроль": { icon: HardHat, color: "text-accent", bgColor: "bg-accent/10" },
  };

  const getProgramMeta = (category: string) =>
    programTypeMetaStudent[category] || { icon: BookOpen, color: "text-primary", bgColor: "bg-primary/10" };

  const getSubMeta = (category: string) =>
    subCategoryMetaStudent[category] || { icon: BookOpen, color: "text-primary", bgColor: "bg-primary/10" };

  const formatPrice = (price: number) =>
    new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(price);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }
  const VISIBLE_CARDS = 4;

  const getCourseImage = (item: MarketplaceCourse) =>
    item.preview_image_url || (item.course as any)?.cover_image_url || null;

  const renderVisualCard = (item: MarketplaceCourse) => {
    const img = getCourseImage(item);
    return (
      <Card
        key={item.id}
        className="flex flex-col hover:shadow-md transition-shadow cursor-pointer group overflow-hidden"
        onClick={() => openPreview(item)}
      >
        <div className="h-40 overflow-hidden bg-muted">
          {img ? (
            <img
              src={img}
              alt={item.course?.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-primary/20 via-primary/10 to-accent/10 flex items-center justify-center">
              <BookOpen className="w-10 h-10 text-primary/30" />
            </div>
          )}
        </div>
        <CardContent className="flex-1 p-4 pb-2">
          <h4 className="font-semibold text-sm leading-tight line-clamp-2 mb-1">
            {item.course?.title}
          </h4>
          {(item.description_short || item.course?.description) && (
            <p className="text-xs text-muted-foreground line-clamp-2">
              {item.description_short || item.course?.description}
            </p>
          )}
        </CardContent>
        <CardFooter className="p-4 pt-2 flex items-center justify-between">
          {item.price_student > 0 ? (
            <span className="text-sm font-bold text-primary">{formatPrice(item.price_student)}</span>
          ) : (
            <Badge className="bg-green-500/10 text-green-600 border-green-500/20 text-xs px-2 py-0.5">Бесплатно</Badge>
          )}
          <Button size="sm" variant="outline" className="rounded-lg text-xs h-7 px-2.5 gap-1"
            onClick={(e) => { e.stopPropagation(); openPreview(item); }}>
            <Eye className="w-3.5 h-3.5" />
            Подробнее
          </Button>
        </CardFooter>
      </Card>
    );
  };

  const renderCourseSection = (courses: MarketplaceCourse[]) => {
    if (courses.length === 0) {
      return <p className="text-xs text-muted-foreground py-2 italic">Курсы ещё не добавлены</p>;
    }
    const visible = courses.slice(0, VISIBLE_CARDS);
    const hidden = courses.slice(VISIBLE_CARDS);

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {visible.map(renderVisualCard)}
        </div>
        {hidden.length > 0 && (
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground">
                <ChevronDown className="w-4 h-4" />
                Ещё {hidden.length} {hidden.length === 1 ? 'курс' : hidden.length < 5 ? 'курса' : 'курсов'}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
                {hidden.map((item) => (
                  <button
                    key={item.id}
                    className="flex items-start gap-2 py-1 text-left hover:text-accent transition-colors group/item"
                    onClick={() => openPreview(item)}
                  >
                    <CheckCircle2 className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                    <span className="text-sm text-foreground/75 group-hover/item:text-accent">{item.course?.title}</span>
                  </button>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>
    );
  };

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

      {/* Catalog */}
      {filteredCatalog.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Store className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Курсы пока не найдены</p>
          <p className="text-sm">Попробуйте изменить поисковый запрос</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groupedCatalog.map((group) => {
            const meta = getProgramMeta(group.category);
            const CatIcon = meta.icon;

            if (group.subGroups) {
              return (
                <Collapsible key={group.category} defaultOpen={false}>
                  <CollapsibleTrigger className="flex items-center gap-3 w-full p-4 rounded-xl border border-border bg-card hover:bg-secondary/30 transition-colors">
                    <div className={`w-10 h-10 rounded-lg ${meta.bgColor} flex items-center justify-center shrink-0`}>
                      <CatIcon className={`w-5 h-5 ${meta.color}`} />
                    </div>
                    <div className="flex-1 text-left">
                      <h3 className="font-display text-lg font-medium">{group.category}</h3>
                    </div>
                    <Badge variant="outline" className="text-[10px]">{group.badge}</Badge>
                    <Badge variant="secondary">{group.courses.length} курсов</Badge>
                    <ChevronDown className="w-5 h-5 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-3 mt-3 pl-2">
                    {group.subGroups.map((sub) => {
                      const subMeta = getSubMeta(sub.category);
                      const SubIcon = subMeta.icon;
                      return (
                        <Collapsible key={sub.category} defaultOpen={false}>
                          <CollapsibleTrigger className="flex items-center gap-3 w-full p-3 rounded-lg border border-border/60 bg-card/80 hover:bg-secondary/20 transition-colors">
                            <div className={`w-8 h-8 rounded-lg ${subMeta.bgColor} flex items-center justify-center shrink-0`}>
                              <SubIcon className={`w-4 h-4 ${subMeta.color}`} />
                            </div>
                            <span className="flex-1 text-left font-medium text-sm">{sub.category}</span>
                            <span className="text-xs text-muted-foreground">
                              {sub.courses.length} {sub.courses.length === 1 ? 'курс' : sub.courses.length < 5 ? 'курса' : 'курсов'}
                            </span>
                            <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" />
                          </CollapsibleTrigger>
                          <CollapsibleContent className="pt-3 pl-11">
                            {renderCourseSection(sub.courses)}
                          </CollapsibleContent>
                        </Collapsible>
                      );
                    })}
                  </CollapsibleContent>
                </Collapsible>
              );
            }

            return (
              <Collapsible key={group.category} defaultOpen={false}>
                <CollapsibleTrigger className="flex items-center gap-3 w-full p-4 rounded-xl border border-border bg-card hover:bg-secondary/30 transition-colors">
                  <div className={`w-10 h-10 rounded-lg ${meta.bgColor} flex items-center justify-center shrink-0`}>
                    <CatIcon className={`w-5 h-5 ${meta.color}`} />
                  </div>
                  <span className="flex-1 text-left font-display text-lg font-medium">{group.category}</span>
                  <Badge variant="outline" className="text-[10px]">{group.badge}</Badge>
                  <Badge variant="secondary">
                    {group.courses.length} {group.courses.length === 1 ? 'курс' : group.courses.length < 5 ? 'курса' : 'курсов'}
                  </Badge>
                  <ChevronDown className="w-5 h-5 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" />
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3 pl-13">
                  {renderCourseSection(group.courses)}
                </CollapsibleContent>
              </Collapsible>
            );
          })}
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

      {/* Preview Sheet */}
      <Sheet open={!!previewCourse} onOpenChange={(open) => !open && setPreviewCourse(null)}>
        <SheetContent side="right" className="w-full sm:max-w-lg p-0 flex flex-col">
          <ScrollArea className="flex-1">
            {previewCourse && (
              <div>
                {/* Banner */}
                {previewCourse.preview_image_url ? (
                  <div className="h-48 w-full overflow-hidden">
                    <img
                      src={previewCourse.preview_image_url}
                      alt={previewCourse.course?.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="h-32 w-full bg-gradient-to-br from-primary/20 via-primary/10 to-transparent flex items-center justify-center">
                    <BookOpen className="w-12 h-12 text-primary/40" />
                  </div>
                )}

                <div className="p-6 space-y-5">
                  <SheetHeader className="p-0 space-y-2">
                    <SheetTitle className="text-xl leading-tight">
                      {previewCourse.course?.title}
                    </SheetTitle>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Building2 className="w-4 h-4 shrink-0" />
                      <span>{previewCourse.organization?.name || "Организация"}</span>
                    </div>
                  </SheetHeader>

                  {/* Duration */}
                  {previewCourse.course?.duration && (
                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <span>{previewCourse.course.duration}</span>
                    </div>
                  )}

                  {/* Price badge */}
                  <div className="inline-flex items-center gap-2 bg-primary/10 text-primary font-bold rounded-xl px-4 py-2 text-lg">
                    {formatPrice(previewCourse.price_student)}
                  </div>

                  {/* Description */}
                  {(previewCourse.description_short || previewCourse.course?.description) && (
                    <div>
                      <h4 className="font-semibold text-sm mb-2">Описание</h4>
                      <p className="text-sm text-muted-foreground whitespace-pre-line">
                        {previewCourse.description_short || previewCourse.course?.description}
                      </p>
                    </div>
                  )}

                  <Separator />

                  {/* Lessons */}
                  <div>
                    <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                      <BookOpen className="w-4 h-4" />
                      Программа курса
                      {previewLessons.length > 0 && (
                        <Badge variant="secondary" className="ml-auto">
                          {previewLessons.length} {previewLessons.length === 1 ? "урок" : previewLessons.length < 5 ? "урока" : "уроков"}
                        </Badge>
                      )}
                    </h4>

                    {isLoadingPreview ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : previewLessons.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4 text-center">
                        Информация о программе пока недоступна
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {previewLessons.map((lesson, idx) => {
                          const lt = lessonTypeIcon[lesson.type] || lessonTypeIcon.text;
                          const Icon = lt.icon;
                          return (
                            <div
                              key={lesson.id}
                              className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors"
                            >
                              <span className="text-xs text-muted-foreground w-5 text-right shrink-0">
                                {idx + 1}
                              </span>
                              <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center shrink-0">
                                <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium truncate">{lesson.title}</p>
                                <p className="text-xs text-muted-foreground">{lt.label}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </ScrollArea>

          {/* Sticky footer */}
          {previewCourse && (
            <div className="border-t p-4 flex items-center justify-between bg-background">
              {previewCourse.price_student > 0 ? (
                <span className="text-lg font-bold text-primary">
                  {formatPrice(previewCourse.price_student)}
                </span>
              ) : (
                <Badge className="bg-green-500/10 text-green-600 border-green-500/20 text-sm px-3 py-1">Бесплатно</Badge>
              )}
              <Button className={`rounded-xl gap-2 ${previewCourse.price_student === 0 ? 'bg-green-600 hover:bg-green-700 text-white' : ''}`} onClick={handleOrderFromPreview}>
                {previewCourse.price_student > 0 ? <><ShoppingCart className="w-4 h-4" />Купить за {formatPrice(previewCourse.price_student)}</> : <><Gift className="w-4 h-4" />Получить бесплатно</>}
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Order Dialog */}
      <Dialog open={!!selectedCourse} onOpenChange={(open) => !open && setSelectedCourse(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{selectedCourse?.price_student ? 'Купить курс' : 'Получить курс бесплатно'}</DialogTitle>
            <DialogDescription>
              {selectedCourse?.price_student ? 'Заявка будет отправлена организации-продавцу' : 'Курс будет добавлен в ваш личный кабинет'}
            </DialogDescription>
          </DialogHeader>
          {selectedCourse && (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-secondary">
                <p className="font-medium text-sm">{selectedCourse.course?.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {selectedCourse.organization?.name}
                </p>
                {selectedCourse.price_student > 0 ? (
                  <p className="text-primary font-bold mt-2">{formatPrice(selectedCourse.price_student)}</p>
                ) : (
                  <Badge className="bg-green-500/10 text-green-600 border-green-500/20 mt-2">Бесплатно</Badge>
                )}
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
            <Button onClick={handleOrder} disabled={isOrdering} className={`gap-2 ${selectedCourse?.price_student === 0 ? 'bg-green-600 hover:bg-green-700 text-white' : ''}`}>
              {isOrdering ? <Loader2 className="w-4 h-4 animate-spin" /> : selectedCourse?.price_student ? <Send className="w-4 h-4" /> : <Gift className="w-4 h-4" />}
              {selectedCourse?.price_student ? 'Отправить заявку' : 'Получить бесплатно'}
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
