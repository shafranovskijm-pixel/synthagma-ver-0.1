import { useState, useEffect } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  BookOpen, MessageCircle, Menu, Eye, X, User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { PullToRefreshIndicator } from "@/components/ui/PullToRefreshIndicator";
import { OnboardingDialog } from "@/components/onboarding/OnboardingDialog";
import { studentOnboardingSteps } from "@/constants/onboardingSteps";
import { VideoIdentification } from "@/components/student/VideoIdentification";
import { StudentConsentForm } from "@/components/student/StudentConsentForm";
import { StudentDocumentsUpload } from "@/components/student/StudentDocumentsUpload";
import { AchievementsPanel } from "@/components/student/AchievementsPanel";
import { useStudentDashboard } from "@/hooks/useStudentDashboard";
import { toast } from "sonner";
import { StudentChatsTab } from "@/components/student/StudentChatsTab";
import { StudentSidebar, type StudentTab } from "@/components/student/StudentSidebar";
import { StudentHeader } from "@/components/student/StudentHeader";
import { StudentFooter } from "@/components/student/StudentFooter";
import { OrgBanner } from "@/components/student/OrgBanner";
import { CourseCatalog } from "@/components/student/CourseCatalog";
import { cn } from "@/lib/utils";
import { StudentWebinarsList } from "@/components/student/StudentWebinarsList";
import { Student3DTrainers } from "@/components/student/Student3DTrainers";
import { StudentProfileContent } from "@/components/student/StudentProfileContent";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CreditCard, ClipboardCheck } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

// T-Bank SDK loader
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

function CatalogContent({
  catalogCourses, categories, handleCourseClick,
  enrolledCourses, isVideoIdentified, totalProgress, totalTimeSpent, totalCompletedLessons, formatTime,
  user, contentTab,
}: any) {
  const [confirmCourse, setConfirmCourse] = useState<any>(null);
  const [enrollCourse, setEnrollCourse] = useState<any>(null);
  const [sendingCourseId, setSendingCourseId] = useState<string | null>(null);
  const [enrollingCourseId, setEnrollingCourseId] = useState<string | null>(null);
  const [paymentMode, setPaymentMode] = useState<"redirect" | "widget">("redirect");

  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from("profiles")
      .select("organization_id")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data?.organization_id) return;
        supabase
          .from("organization_payment_settings")
          .select("payment_mode" as any)
          .eq("organization_id", data.organization_id)
          .maybeSingle()
          .then(({ data: paymentData }) => {
            if (paymentData) setPaymentMode((paymentData as any).payment_mode || "redirect");
          });
      });
  }, [user?.id]);

  const handleBuy = (courseId: string) => {
    const course = catalogCourses.find((c: any) => c.id === courseId);
    if (course) setConfirmCourse(course);
  };

  const handleEnroll = (courseId: string) => {
    const course = catalogCourses.find((c: any) => c.id === courseId);
    if (course) setEnrollCourse(course);
  };

  const handlePayment = async (course: any) => {
    setSendingCourseId(course.id);
    try {
      const { data, error } = await supabase.functions.invoke("tbank-init", {
        body: { course_id: course.id, user_id: user?.id, email: user?.email },
      });
      if (error || !data?.url) throw new Error(data?.error || "Ошибка инициализации оплаты");

      if (paymentMode === "widget" && data.paymentId) {
        try {
          await loadTBankSdk();
          const pay = (window as any).pay;
          if (pay) {
            pay({
              paymentId: data.paymentId,
              onSuccess: () => { toast.success("Оплата прошла успешно!"); setSendingCourseId(null); setConfirmCourse(null); },
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

  const handleEnrollRequest = async (course: any) => {
    if (!user?.id) return;
    setEnrollingCourseId(course.id);
    try {
      const { data: existingRequest } = await supabase
        .from("enrollment_requests")
        .select("id")
        .eq("user_id", user.id)
        .eq("course_id", course.id)
        .eq("status", "pending")
        .maybeSingle();

      if (existingRequest) {
        toast.info("Вы уже отправляли заявку на этот курс");
        setEnrollCourse(null);
        return;
      }

      const { error: requestError } = await supabase.from("enrollment_requests").insert({
        user_id: user.id,
        course_id: course.id,
        status: "pending"
      } as any);
      if (requestError) throw requestError;

      await supabase.functions.invoke("notify-enrollment-request", {
        body: { course_id: course.id },
      });

      toast.success("Заявка отправлена!");
      setEnrollCourse(null);
    } catch (err: any) {
      console.error("Enrollment request error:", err);
      toast.error(err.message || "Ошибка при отправке заявки");
    } finally {
      setEnrollingCourseId(null);
    }
  };

  return (
    <div className="space-y-4 md:space-y-6">
      {contentTab === "courses" && (
        <CourseCatalog
          courses={catalogCourses}
          categories={categories}
          onCourseClick={(id: string, enrolled: boolean) => handleCourseClick(id, enrolled)}
          enrolledCourses={enrolledCourses}
          isVideoIdentified={isVideoIdentified}
          totalProgress={totalProgress}
          totalTimeSpent={totalTimeSpent}
          totalCompletedLessons={totalCompletedLessons}
          formatTime={formatTime}
          onBuy={handleBuy}
          onEnroll={handleEnroll}
        />
      )}
      {contentTab === "webinars" && <StudentWebinarsList />}
      {contentTab === "trainers" && <Student3DTrainers />}

      <AlertDialog open={!!confirmCourse} onOpenChange={(open) => !open && setConfirmCourse(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Оплата курса</AlertDialogTitle>
            <AlertDialogDescription>
              Вы будете перенаправлены на страницу оплаты курса
              «{confirmCourse?.title}» ({confirmCourse ? Number(confirmCourse.price).toLocaleString("ru-RU") : 0} ₽).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmCourse && handlePayment(confirmCourse)}
              disabled={sendingCourseId === confirmCourse?.id}
            >
              <CreditCard className="w-4 h-4 mr-2" />
              Перейти к оплате
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!enrollCourse} onOpenChange={(open) => !open && setEnrollCourse(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Заявка на запись</AlertDialogTitle>
            <AlertDialogDescription>
              Ваша заявка на курс «{enrollCourse?.title}» будет отправлена в учебный центр.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => enrollCourse && handleEnrollRequest(enrollCourse)}
              disabled={enrollingCourseId === enrollCourse?.id}
            >
              <ClipboardCheck className="w-4 h-4 mr-2" />
              Отправить заявку
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function StudentDashboard() {
  const [contentTab, setContentTab] = useState<"courses" | "webinars" | "trainers" | "chat">("courses");
  const { userRole } = useAuth();
  const isMobile = useIsMobile();

  const isAdminViewFromStorage = (() => {
    try { return !!localStorage.getItem('adminViewAsStudent'); } catch { return false; }
  })();
  const isPreviewFromStorage = (() => {
    try { return localStorage.getItem('previewStudentDashboard') === 'true'; } catch { return false; }
  })();

  const {
    user, navigate, theme, setTheme,
    activeTab, setActiveTab: setActiveTabRaw, messages, inputValue, setInputValue, isAiLoading, handleSendMessage,
    courses, catalogCourses, categories, profile, branding, dashboardSettings, loading,
    totalTimeSpent, totalCompletedLessons, totalProgress, firstName, formatTime,
    isPreviewMode, showVideoIdentification, setShowVideoIdentification,
    showConsentForm, setShowConsentForm, showDocumentsUpload, setShowDocumentsUpload,
    showAchievements, setShowAchievements, mobileMenuOpen, setMobileMenuOpen,
    documentsProgress, isVideoIdentified, setIsVideoIdentified, showOnboarding, handleOnboardingClose,
    handleLogout, pullToRefreshRef, pullDistance, isRefreshing, canRefresh, orgPlan,
    isAdminView, adminViewStudentName } = useStudentDashboard();

  const setActiveTab = (tab: StudentTab) => setActiveTabRaw(tab as any);
  const currentTab: StudentTab = (activeTab === "store" || activeTab === "library" ? "catalog" : activeTab) as StudentTab;

  const pendingDocsCount = documentsProgress.total - documentsProgress.completed;

  if (userRole && userRole !== 'student' && !isAdminView && !isAdminViewFromStorage && !isPreviewMode && !isPreviewFromStorage) {
    if (userRole === 'organization') return <Navigate to="/organization" replace />;
    if (userRole === 'company') return <Navigate to="/company" replace />;
    if (userRole === 'admin') return <Navigate to="/admin" replace />;
    if (userRole === 'sales_manager') return <Navigate to="/sales" replace />;
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><SigmaSpinner size="lg" /></div>;

  const handleCourseClick = (courseId: string, isEnrolled: boolean) => {
    if (isEnrolled) {
      const course = courses.find(c => c.id === courseId);
      const needsVerification = course?.skip_video_identification === false && !isVideoIdentified;
      if (needsVerification) {
        toast.error("Требуется видеоидентификация", { description: "Пройдите видеоидентификацию перед началом курса" });
        setShowVideoIdentification(true);
        return;
      }
      navigate(`/course/${courseId}/learn`);
    } else {
      navigate(`/course/${courseId}/landing`);
    }
  };

  // Bottom navigation items for mobile
  const bottomNavItems: { id: StudentTab; icon: typeof BookOpen; label: string }[] = [
    { id: "catalog", icon: BookOpen, label: "Каталог" },
    ...(dashboardSettings.showAiChat ? [{ id: "chat" as StudentTab, icon: MessageCircle, label: "Чат" }] : []),
    { id: "profile" as StudentTab, icon: User, label: "Профиль" },
  ];

  return (
    <div className="min-h-screen bg-background flex">
      {/* Admin/preview bar */}
      {isAdminView && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-primary text-primary-foreground py-2 px-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4" />
            <span className="text-sm font-medium">Режим просмотра: {adminViewStudentName}</span>
          </div>
          <Button variant="secondary" size="sm" onClick={() => {
            const raw = localStorage.getItem('adminViewAsStudent');
            let returnPath = '/admin';
            try { const d = JSON.parse(raw || '{}'); if (d.orgReturn) returnPath = d.orgReturn; } catch {}
            localStorage.removeItem('adminViewAsStudent');
            navigate(returnPath);
          }} className="gap-1">
            <X className="w-3 h-3" />Выйти
          </Button>
        </div>
      )}
      {isPreviewMode && !isAdminView && (
        <div className="fixed top-0 inset-x-0 bg-primary text-primary-foreground py-2 px-4 text-center text-sm z-50 flex items-center justify-center gap-2">
          <Eye className="w-4 h-4" />Режим предпросмотра
          <Button size="sm" variant="secondary" className="ml-4 h-7" onClick={() => window.close()}>Закрыть</Button>
        </div>
      )}

      {/* Desktop sidebar — hidden on mobile */}
      <div className="hidden md:block">
        <StudentSidebar
          activeTab={currentTab}
          setActiveTab={setActiveTab}
          branding={branding}
          orgName={profile?.organization_name || null}
          showAiChat={dashboardSettings.showAiChat}
          isPreviewMode={isPreviewMode}
          isAdminView={isAdminView}
        />
      </div>

      {/* Main content */}
      <div className={cn("flex-1 flex flex-col min-w-0", (isPreviewMode || isAdminView) && "md:mt-10")}>
        {/* Top header */}
        <StudentHeader
          fullName={profile?.full_name || null}
          orgName={profile?.organization_name || null}
          logoUrl={branding?.logoUrl}
          onLogout={handleLogout}
          setTheme={setTheme}
          pendingCount={pendingDocsCount}
          isVideoIdentified={isVideoIdentified}
          showAchievements={dashboardSettings.showAchievements}
          onShowVideoId={() => setShowVideoIdentification(true)}
          onShowConsent={() => setShowConsentForm(true)}
          onShowDocs={() => setShowDocumentsUpload(true)}
          onShowAchievements={() => setShowAchievements(true)}
          onProfileClick={() => setActiveTab("profile" as any)}
        />

        <main
          ref={isMobile ? pullToRefreshRef : undefined}
          className="flex-1 overflow-auto md:pt-0 flex flex-col pb-20 md:pb-0"
        >
          {isMobile && <PullToRefreshIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} canRefresh={canRefresh} threshold={80} />}

          {/* Catalog tab */}
          {currentTab === "catalog" && (
            <CatalogContent
              catalogCourses={catalogCourses}
              categories={categories}
              profile={profile}
              branding={branding}
              handleCourseClick={handleCourseClick}
              enrolledCourses={courses}
              isVideoIdentified={isVideoIdentified}
              totalProgress={totalProgress}
              totalTimeSpent={totalTimeSpent}
              totalCompletedLessons={totalCompletedLessons}
              formatTime={formatTime}
              user={user}
            />
          )}

          {/* Chat tab */}
          {currentTab === "chat" && (
            <div className="flex-1 flex flex-col">
              {/* Mobile header for chat */}
              <div className="md:hidden px-4 pt-3 pb-2 flex items-center gap-3 border-b border-border bg-card">
                {branding?.logoUrl && <img src={branding.logoUrl} alt="" className="w-8 h-8 rounded-full object-cover" />}
                <span className="font-semibold text-sm truncate">{profile?.organization_name || "Чат"}</span>
              </div>
              <StudentChatsTab
                organizationId={profile?.organization_id}
                organizationName={profile?.organization_name || "Организация"}
              />
            </div>
          )}

          {/* Profile tab */}
          {currentTab === ("profile" as any) && user && (
            <div className="flex-1">
              <StudentProfileContent
                effectiveUserId={user.id}
                isAdminView={isAdminView}
              />
            </div>
          )}

          {/* Footer */}
          {(currentTab === "catalog" || currentTab === ("profile" as any)) && (
            <StudentFooter
              orgName={profile?.organization_name || null}
              logoUrl={branding?.logoUrl}
              orgDescription={profile?.org_description}
            />
          )}
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-card border-t border-border">
        <nav className="flex items-center justify-around h-14">
          {bottomNavItems.map(item => {
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}
              >
                <item.icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Dialogs */}
      {showVideoIdentification && user && (
        <VideoIdentification
          userId={user.id}
          userName={profile?.full_name || "Ученик"}
          organizationId={profile?.organization_id || undefined}
          isOpen={showVideoIdentification}
          onOpenChange={setShowVideoIdentification}
          onVerified={() => setIsVideoIdentified(true)}
        />
      )}
      {showConsentForm && user && profile?.organization_id && (
        <StudentConsentForm
          userId={user.id}
          userName={profile?.full_name || "Ученик"}
          organizationId={profile.organization_id}
          isOpen={showConsentForm}
          onOpenChange={setShowConsentForm}
        />
      )}
      {showDocumentsUpload && user && profile?.organization_id && (
        <StudentDocumentsUpload
          userId={user.id}
          organizationId={profile.organization_id}
          isOpen={showDocumentsUpload}
          onOpenChange={setShowDocumentsUpload}
        />
      )}
      {showAchievements && user && (
        <AchievementsPanel
          userId={user.id}
          isOpen={showAchievements}
          onOpenChange={setShowAchievements}
        />
      )}
      {showOnboarding && <OnboardingDialog open={showOnboarding} onClose={handleOnboardingClose} steps={studentOnboardingSteps} />}
    </div>
  );
}
