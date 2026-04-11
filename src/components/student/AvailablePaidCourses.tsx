import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { BookOpen, CreditCard, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

interface PaidCourse {
  id: string;
  title: string;
  description: string | null;
  duration: string | null;
  price: number;
  organization_id: string;
}

interface Props {
  userId: string;
  organizationId: string | null;
  userEmail?: string;
}

export function AvailablePaidCourses({ userId, organizationId, userEmail }: Props) {
  const [courses, setCourses] = useState<PaidCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [payingCourseId, setPayingCourseId] = useState<string | null>(null);

  useEffect(() => {
    if (!organizationId) return;
    fetchAvailableCourses();
  }, [organizationId, userId]);

  const fetchAvailableCourses = async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      // Get courses with price > 0 from the student's organization
      const { data: paidCourses, error: coursesErr } = await supabase
        .from("courses")
        .select("id, title, description, duration, price, organization_id")
        .eq("organization_id", organizationId)
        .eq("is_published", true)
        .gt("price", 0);

      if (coursesErr) throw coursesErr;

      // Get student's current enrollments
      const { data: enrollments } = await supabase
        .from("enrollments")
        .select("course_id")
        .eq("user_id", userId);

      const enrolledCourseIds = new Set((enrollments || []).map(e => e.course_id));

      // Filter out already enrolled courses
      setCourses((paidCourses || []).filter(c => !enrolledCourseIds.has(c.id)));
    } catch (err) {
      console.error("Error fetching paid courses:", err);
    } finally {
      setLoading(false);
    }
  };

  const handlePay = async (course: PaidCourse) => {
    setPayingCourseId(course.id);
    try {
      const { data, error } = await supabase.functions.invoke("robokassa-init", {
        body: {
          course_id: course.id,
          user_id: userId,
          email: userEmail,
        },
      });

      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      } else {
        toast.error("Не удалось получить ссылку для оплаты");
      }
    } catch (err) {
      console.error("Payment init error:", err);
      toast.error("Ошибка при инициализации оплаты");
    } finally {
      setPayingCourseId(null);
    }
  };

  if (loading) return null;
  if (courses.length === 0) return null;

  return (
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
            <Button
              className="w-full"
              onClick={() => handlePay(course)}
              disabled={payingCourseId === course.id}
            >
              {payingCourseId === course.id ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <CreditCard className="w-4 h-4 mr-2" />
              )}
              Оплатить {Number(course.price).toLocaleString("ru-RU")} ₽
            </Button>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
