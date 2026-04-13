import { useState, useEffect } from "react";
import { BookOpen, ShoppingCart, Check, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface CourseProgramsListProps {
  organizationId: string | null;
}

interface CourseWithProgram {
  id: string;
  title: string;
  is_published: boolean;
  has_program: boolean;
  order_pending: boolean;
}

export function CourseProgramsList({ organizationId }: CourseProgramsListProps) {
  const [courses, setCourses] = useState<CourseWithProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [ordering, setOrdering] = useState<string | null>(null);

  useEffect(() => {
    if (!organizationId) return;
    fetchCourses();
  }, [organizationId]);

  const fetchCourses = async () => {
    if (!organizationId) return;
    setLoading(true);

    // Fetch courses
    const { data: coursesData } = await supabase
      .from("courses")
      .select("id, title, is_published")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });

    // Fetch existing program orders
    const { data: orders } = await supabase
      .from("service_orders")
      .select("notes, status")
      .eq("organization_id", organizationId)
      .eq("service_id", "program");

    // Fetch course_documents of type "program"
    const courseIds = (coursesData || []).map(c => c.id);
    const { data: docs } = courseIds.length > 0
      ? await supabase
          .from("course_documents")
          .select("course_id")
          .in("course_id", courseIds)
          .eq("type", "program")
      : { data: [] };

    const docsSet = new Set((docs || []).map(d => d.course_id));
    const pendingOrders = new Set(
      (orders || [])
        .filter(o => o.status === "pending" || o.status === "in_progress")
        .map(o => o.notes || "")
    );

    setCourses(
      (coursesData || []).map(c => ({
        ...c,
        has_program: docsSet.has(c.id),
        order_pending: pendingOrders.has(c.title),
      }))
    );
    setLoading(false);
  };

  const handleOrderProgram = async (course: CourseWithProgram) => {
    if (!organizationId) return;
    setOrdering(course.id);

    try {
      // Create service order
      const { error } = await supabase.from("service_orders").insert({
        organization_id: organizationId,
        service_id: "program",
        service_title: "Разработка образовательной программы",
        service_price: "По запросу",
        notes: course.title,
        status: "pending",
      });

      if (error) throw error;

      // Send notification via edge function
      const { data: orgData } = await supabase
        .from("organizations")
        .select("name")
        .eq("id", organizationId)
        .single();

      await supabase.functions.invoke("notify-program-order", {
        body: {
          organization_id: organizationId,
          organization_name: orgData?.name || "Неизвестная",
          course_title: course.title,
        },
      });

      toast({ title: "Заявка отправлена", description: "Мы свяжемся с вами для уточнения деталей" });
      fetchCourses();
    } catch (e: any) {
      toast({ title: "Ошибка", description: e.message, variant: "destructive" });
    } finally {
      setOrdering(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Info block */}
      <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20">
        <CardContent className="flex items-start gap-3 py-4">
          <AlertCircle className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
          <div className="text-sm text-muted-foreground">
            <p className="font-medium text-foreground mb-1">Образовательные программы</p>
            По законодательству у каждого курса должна быть образовательная программа. 
            Добавьте программу самостоятельно в документы курса или закажите разработку у нас.
          </div>
        </CardContent>
      </Card>

      {courses.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p>У вас пока нет курсов</p>
            <p className="text-xs mt-1">Создайте курс, чтобы добавить к нему программу</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {courses.map(course => (
            <Card key={course.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="flex items-center justify-between py-3 px-4">
                <div className="flex items-center gap-3 min-w-0">
                  <BookOpen className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{course.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {course.has_program ? (
                        <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800">
                          <Check className="w-3 h-3 mr-1" />
                          Программа добавлена
                        </Badge>
                      ) : course.order_pending ? (
                        <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800">
                          <Loader2 className="w-3 h-3 mr-1" />
                          Заявка на рассмотрении
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-muted-foreground">
                          Нет программы
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                {!course.has_program && !course.order_pending && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleOrderProgram(course)}
                    disabled={ordering === course.id}
                    className="shrink-0 ml-3"
                  >
                    {ordering === course.id ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                    ) : (
                      <ShoppingCart className="w-4 h-4 mr-1.5" />
                    )}
                    Заказать программу
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
