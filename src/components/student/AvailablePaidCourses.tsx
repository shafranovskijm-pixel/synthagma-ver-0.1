import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { BookOpen, CreditCard, Eye } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle } from "@/components/ui/alert-dialog";

interface PaidCourse {
  id: string;
  title: string;
  description: string | null;
  duration: string | null;
  price: number;
  organization_id: string;
  slug: string | null;
}

interface Props {
  userId: string;
  organizationId: string | null;
  userEmail?: string;
}

export function AvailablePaidCourses({ userId, organizationId, userEmail }: Props) {
  const navigate = useNavigate();
  const [courses, setCourses] = useState<PaidCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingCourseId, setSendingCourseId] = useState<string | null>(null);
  const [confirmCourse, setConfirmCourse] = useState<PaidCourse | null>(null);

  useEffect(() => {
    if (!organizationId) return;
    fetchAvailableCourses();
  }, [organizationId, userId]);

  const fetchAvailableCourses = async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      const { data: paidCourses, error: coursesErr } = await supabase
        .from("courses")
        .select("id, title, description, duration, price, organization_id, slug")
        .eq("organization_id", organizationId)
        .eq("is_published", true)
        .gt("price", 0);

      if (coursesErr) throw coursesErr;

      const { data: enrollments } = await supabase
        .from("enrollments")
        .select("course_id")
        .eq("user_id", userId);

      const enrolledCourseIds = new Set((enrollments || []).map(e => e.course_id));
      setCourses((paidCourses || []).filter(c => !enrolledCourseIds.has(c.id)));
    } catch (err) {
      console.error("Error fetching paid courses:", err);
    } finally {
      setLoading(false);
    }
  };

  const handlePayment = async (course: PaidCourse) => {
    setSendingCourseId(course.id);
    try {
      const { data, error } = await supabase.functions.invoke("tbank-init", {
        body: {
          course_id: course.id,
          user_id: userId,
          email: userEmail,
        },
      });

      if (error || !data?.url) {
        throw new Error(data?.error || "Ошибка инициализации оплаты");
      }

      // Redirect to T-Bank payment page
      window.location.href = data.url;
    } catch (err: any) {
      console.error("Payment error:", err);
      toast.error(err.message || "Ошибка при создании платежа");
      setSendingCourseId(null);
    }
  };

  const handleViewCourse = (course: PaidCourse) => {
    if (course.slug) {
      navigate(`/c/${course.slug}`);
    } else {
      navigate(`/course/${course.id}/landing`);
    }
  };

  if (loading) return null;
  if (courses.length === 0) return null;

  return (
    <>
      <div className="mt-8">
        <h2 className="font-display text-xl font-semibold mb-4">Доступные курсы</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {courses.map((course, i) => (
            <motion.div
              key={course.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="bg-card rounded-2xl border border-border p-5 hover:shadow-lg transition-all"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <BookOpen className="w-6 h-6 text-primary" />
                </div>
                <div className="bg-primary/10 text-primary px-3 py-1 rounded-lg text-sm font-semibold">
                  {Number(course.price).toLocaleString("ru-RU")} ₽
                </div>
              </div>
              <h3 className="font-semibold mb-2 line-clamp-2">{course.title}</h3>
              {course.description && (
                <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{course.description}</p>
              )}
              {course.duration && (
                <p className="text-xs text-muted-foreground mb-4">{course.duration}</p>
              )}
              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => handleViewCourse(course)}
                >
                  <Eye className="w-4 h-4 mr-2" />
                  Посмотреть курс
                </Button>
                <Button
                  className="w-full"
                  onClick={() => setConfirmCourse(course)}
                  disabled={sendingCourseId === course.id}
                >
                  {sendingCourseId === course.id ? (
                    <SigmaSpinner size="sm" className="mr-2" />
                  ) : (
                    <Send className="w-4 h-4 mr-2" />
                  )}
                  Записаться
                </Button>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      <AlertDialog open={!!confirmCourse} onOpenChange={(open) => !open && setConfirmCourse(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Оплата курса</AlertDialogTitle>
            <AlertDialogDescription>
              Вы будете перенаправлены на страницу оплаты курса
              «{confirmCourse?.title}» ({confirmCourse ? Number(confirmCourse.price).toLocaleString("ru-RU") : 0} ₽).
              Оплата проходит через защищённый сервис Т-Банк.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmCourse && handlePayment(confirmCourse)}
              disabled={sendingCourseId === confirmCourse?.id}
            >
              {sendingCourseId === confirmCourse?.id ? (
                <SigmaSpinner size="sm" className="mr-2" />
              ) : (
                <CreditCard className="w-4 h-4 mr-2" />
              )}
              Перейти к оплате
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
