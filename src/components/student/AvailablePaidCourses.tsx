import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { BookOpen, CreditCard, Eye, ClipboardCheck } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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

let tbankSdkPromise: Promise<void> | null = null;
function loadTBankSdk(): Promise<void> {
  if (tbankSdkPromise) return tbankSdkPromise;
  tbankSdkPromise = new Promise((resolve, reject) => {
    if ((window as any).pay) { resolve(); return; }
    const script = document.createElement("script");
    script.src = "https://pay.tbank.ru/sdk/3.0/payment.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load T-Bank SDK"));
    document.head.appendChild(script);
  });
  return tbankSdkPromise;
}

export function AvailablePaidCourses({ userId, organizationId, userEmail }: Props) {
  const navigate = useNavigate();
  const [courses, setCourses] = useState<PaidCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingCourseId, setSendingCourseId] = useState<string | null>(null);
  const [enrollingCourseId, setEnrollingCourseId] = useState<string | null>(null);
  const [confirmCourse, setConfirmCourse] = useState<PaidCourse | null>(null);
  const [enrollCourse, setEnrollCourse] = useState<PaidCourse | null>(null);
  const [paymentMode, setPaymentMode] = useState<"redirect" | "widget">("redirect");

  useEffect(() => {
    if (!organizationId) return;
    fetchAvailableCourses();
    fetchPaymentMode();
  }, [organizationId, userId]);

  const fetchPaymentMode = async () => {
    if (!organizationId) return;
    const { data } = await supabase
      .from("organization_payment_settings")
      .select("payment_mode" as any)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (data) setPaymentMode((data as any).payment_mode || "redirect");
  };

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
        body: { course_id: course.id, user_id: userId, email: userEmail },
      });
      if (error || !data?.url) throw new Error(data?.error || "Ошибка инициализации оплаты");

      if (paymentMode === "widget" && data.paymentId) {
        try {
          await loadTBankSdk();
          const pay = (window as any).pay;
          if (pay) {
            pay({
              paymentId: data.paymentId,
              onSuccess: () => { toast.success("Оплата прошла успешно!"); setSendingCourseId(null); setConfirmCourse(null); fetchAvailableCourses(); },
              onClose: () => setSendingCourseId(null),
              onFail: () => { toast.error("Оплата не прошла"); setSendingCourseId(null); },
            });
            return;
          }
        } catch { console.warn("T-Bank SDK unavailable, falling back to redirect"); }
      }
      window.location.href = data.url;
    } catch (err: any) {
      console.error("Payment error:", err);
      toast.error(err.message || "Ошибка при создании платежа");
      setSendingCourseId(null);
    }
  };

  const handleEnrollRequest = async (course: PaidCourse) => {
    setEnrollingCourseId(course.id);
    try {
      const { data: existingRequest } = await supabase
        .from("enrollment_requests")
        .select("id")
        .eq("user_id", userId)
        .eq("course_id", course.id)
        .eq("status", "pending")
        .maybeSingle();

      if (existingRequest) {
        toast.info("Вы уже отправляли заявку на этот курс");
        setEnrollCourse(null);
        return;
      }

      const { error: requestError } = await supabase.from("enrollment_requests").insert({
        user_id: userId,
        course_id: course.id,
        status: "pending"
      } as any);
      if (requestError) throw requestError;

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("user_id", userId)
        .maybeSingle();
      const studentName = profile?.full_name || profile?.email || "Ученик";

      const chatResult = await supabase.from("chat_messages").insert({
        user_id: userId,
        course_id: course.id,
        role: "user",
        content: `Заявка на запись: ${studentName} хочет записаться на курс «${course.title}» (${Number(course.price).toLocaleString("ru-RU")} ₽)`
      });
      if (chatResult.error) {
        console.error("Enrollment request chat error:", chatResult.error);
      }

      const notificationResult = await supabase.from("org_notifications" as any).insert({
        organization_id: course.organization_id,
        user_id: userId,
        type: "enrollment_request",
        title: "Новая заявка на запись",
        message: `${studentName} хочет записаться на курс «${course.title}»`,
        related_id: course.id,
        is_read: false,
      } as any);
      if (notificationResult.error) {
        console.error("Enrollment request notification error:", notificationResult.error);
      }

      toast.success("Заявка отправлена! Учебный центр увидит её в заявках и чате");
      setEnrollCourse(null);
      fetchAvailableCourses();
    } catch (err: any) {
      console.error("Enrollment request error:", err);
      toast.error(err.message || "Ошибка при отправке заявки");
    } finally {
      setEnrollingCourseId(null);
    }
  };

  const handleViewCourse = (course: PaidCourse) => {
    if (course.slug) navigate(`/c/${course.slug}`);
    else navigate(`/course/${course.id}/landing`);
  };

  if (loading || courses.length === 0) return null;

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
                <Button variant="outline" className="w-full" onClick={() => handleViewCourse(course)}>
                  <Eye className="w-4 h-4 mr-2" />
                  Посмотреть курс
                </Button>
                <Button
                  className="w-full"
                  onClick={() => setConfirmCourse(course)}
                  disabled={sendingCourseId === course.id}
                >
                  {sendingCourseId === course.id ? <SigmaSpinner size="sm" className="mr-2" /> : <CreditCard className="w-4 h-4 mr-2" />}
                  Купить
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setEnrollCourse(course)}
                  disabled={enrollingCourseId === course.id}
                >
                  {enrollingCourseId === course.id ? <SigmaSpinner size="sm" className="mr-2" /> : <ClipboardCheck className="w-4 h-4 mr-2" />}
                  Записаться
                </Button>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Payment confirmation dialog */}
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
              {sendingCourseId === confirmCourse?.id ? <SigmaSpinner size="sm" className="mr-2" /> : <CreditCard className="w-4 h-4 mr-2" />}
              Перейти к оплате
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Enrollment request dialog */}
      <AlertDialog open={!!enrollCourse} onOpenChange={(open) => !open && setEnrollCourse(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Заявка на запись</AlertDialogTitle>
            <AlertDialogDescription>
              Ваша заявка на курс «{enrollCourse?.title}» будет отправлена в учебный центр.
              Сотрудники свяжутся с вами для уточнения деталей.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => enrollCourse && handleEnrollRequest(enrollCourse)}
              disabled={enrollingCourseId === enrollCourse?.id}
            >
              {enrollingCourseId === enrollCourse?.id ? <SigmaSpinner size="sm" className="mr-2" /> : <ClipboardCheck className="w-4 h-4 mr-2" />}
              Отправить заявку
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
