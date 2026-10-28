import { useState, useEffect, useRef } from "react";
import { BookOpen, ShoppingCart, Check, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getErrorMessage } from "@/utils/handleSupabaseError";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { ProgramFactsPanel } from "./programs/ProgramFactsPanel";
import { useAuth } from "@/hooks/useAuth";
interface CourseProgramsListProps {
  organizationId: string | null;
  canConfigure?: boolean;
}

interface CourseWithProgram {
  id: string;
  title: string;
  is_published: boolean;
  has_program: boolean;
  program: { id: string; name: string; file_url: string | null; allow_download: boolean } | null;
  order_pending: boolean;
}

export function CourseProgramsList({ organizationId, canConfigure = false }: CourseProgramsListProps) {
  const { user } = useAuth();
  const actorId = user?.id ?? null;
  const scopeRef = useRef({ organizationId, actorId });
  if (scopeRef.current.organizationId !== organizationId || scopeRef.current.actorId !== actorId) {
    scopeRef.current = { organizationId, actorId };
  }
  const scope = scopeRef.current;
  const mounted = useRef(false);
  const loadEpoch = useRef(0);
  const [courses, setCourses] = useState<CourseWithProgram[]>([]);
  const [loadedScope, setLoadedScope] = useState<typeof scope | null>(null);
  const visibleCourses = loadedScope === scope ? courses : [];
  const [loading, setLoading] = useState(true);
  const [ordering, setOrdering] = useState<{ scope: typeof scope; id: string } | null>(null);
  const currentOrdering = ordering?.scope === scope ? ordering.id : null;

  useEffect(() => {
    mounted.current = true;
    if (organizationId && actorId) void fetchCourses();
    else { setCourses([]); setLoadedScope(scope); setLoading(false); }
    return () => { mounted.current = false; loadEpoch.current += 1; };
  }, [scope]);

  const fetchCourses = async () => {
    if (!organizationId || !actorId || !mounted.current || scopeRef.current !== scope) return;
    const epoch = ++loadEpoch.current;
    const current = () => mounted.current && scopeRef.current === scope && epoch === loadEpoch.current;
    setLoading(true);
    try {

    // Fetch courses
    const { data: coursesData, error: coursesError } = await supabase
      .from("courses")
      .select("id, title, is_published")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });

    // Fetch existing program orders
    if (coursesError) throw coursesError;
    const { data: orders, error: ordersError } = await supabase
      .from("service_orders")
      .select("notes, status")
      .eq("organization_id", organizationId)
      .eq("service_id", "program");

    // Fetch course_documents of type "program"
    if (ordersError) throw ordersError;
    const courseIds = (coursesData || []).map(c => c.id);
    const { data: docs, error: docsError } = courseIds.length > 0
      ? await supabase
          .from("course_documents")
          .select("id, course_id, name, file_url, allow_download")
          .in("course_id", courseIds)
          .eq("type", "program")
          .order("created_at", { ascending: false })
      : { data: [], error: null };

    if (docsError) throw docsError;
    if (!current()) return;
    // Presence is document metadata, not proof of available bytes or approval.
    // Frozen files deliberately have no live URL; opening remains in the document manager.
    const docsByCourse = new Map<string, NonNullable<typeof docs>[number]>();
    for (const doc of docs || []) if (!docsByCourse.has(doc.course_id)) docsByCourse.set(doc.course_id, doc);
    const pendingOrders = new Set(
      (orders || [])
        .filter(o => o.status === "pending" || o.status === "in_progress")
        .map(o => o.notes || "")
    );

    setCourses(
      (coursesData || []).map(c => ({
        ...c,
        has_program: docsByCourse.has(c.id),
        program: docsByCourse.get(c.id) ?? null,
        order_pending: pendingOrders.has(c.title),
      }))
    );
    setLoadedScope(scope);
    } catch (error) {
      if (!current()) return;
      setCourses([]); setLoadedScope(scope);
      toast.error(getErrorMessage(error));
    } finally { if (current()) setLoading(false); }
  };

  const handleOrderProgram = async (course: CourseWithProgram) => {
    if (!organizationId || !actorId || !mounted.current || scopeRef.current !== scope || !visibleCourses.includes(course)) return;
    setOrdering({ scope, id: course.id });

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

      if (!mounted.current || scopeRef.current !== scope) return;
      toast.success("Заявка отправлена", { description: "Мы свяжемся с вами для уточнения деталей" });
      fetchCourses();
    } catch (e) {
      if (mounted.current && scopeRef.current === scope) toast.error(getErrorMessage(e));
    } finally {
      if (mounted.current && scopeRef.current === scope) setOrdering(null);
    }
  };

  if (loading || loadedScope !== scope) {
    return (
      <div className="flex items-center justify-center py-12">
        <SigmaSpinner />
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
            Синтагма не останавливает обучение, если файл программы не прикреплён. Сам файл
            не подтверждает сведения программы. Для документов группы отдельно утвердите сведения и выберите версию программы.
          </div>
        </CardContent>
      </Card>

      {organizationId && <ProgramFactsPanel organizationId={organizationId} canConfigure={canConfigure} courses={visibleCourses.map(c => ({ id: c.id, title: c.title }))} />}

      {visibleCourses.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p>У вас пока нет курсов</p>
            <p className="text-xs mt-1">Создайте курс, чтобы добавить к нему программу</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {visibleCourses.map(course => (
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
                          Документ программы добавлен
                        </Badge>
                      ) : course.order_pending ? (
                        <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800">
                          <Loader2 className="w-3 h-3 mr-1" />
                          Заявка на рассмотрении
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-muted-foreground">
                          Нет файла программы
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
                    disabled={currentOrdering === course.id}
                    className="shrink-0 ml-3"
                  >
                    {currentOrdering === course.id ? (
                      <SigmaSpinner size="sm" className="mr-1.5" />
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
